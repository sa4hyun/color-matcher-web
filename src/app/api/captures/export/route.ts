import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { CaptureSession, RawShot } from "@/lib/types";
import { sessionsToCsv } from "@/lib/dataset";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: 사진 수가 많으면 zip 만드는데 시간이 걸릴 수 있음

interface CaptureRow {
  session_id: string;
  label: string;
  step_index: number;
  channel_name: string | null;
  r: number;
  g: number;
  b: number;
  storage_path: string;
  created_at: string;
}

function safeName(name: string): string {
  return (name || "untitled").replace(/[\\/:*?"<>|]/g, "_").trim() || "untitled";
}

function groupIntoSessions(rows: CaptureRow[]): CaptureSession[] {
  const sessions = new Map<string, CaptureSession>();
  for (const row of rows) {
    let session = sessions.get(row.session_id);
    if (!session) {
      session = { id: row.session_id, createdAt: row.created_at, label: row.label, shots: [] };
      sessions.set(row.session_id, session);
    }
    const shot: RawShot = { stepIndex: row.step_index, r: Number(row.r), g: Number(row.g), b: Number(row.b) };
    session.shots.push(shot);
    // 세션의 대표 생성시각은 가장 이른 촬영(step 0=배경)을 기준으로 둔다.
    if (row.created_at < session.createdAt) session.createdAt = row.created_at;
  }
  return Array.from(sessions.values());
}

/**
 * 이미 Supabase에 올라간 촬영 사진들을 "라벨(이름)"별로 묶어서 zip 하나로
 * 한 번에 내려받는 엔드포인트. Supabase Storage 대시보드에서 파일을 하나씩
 * 열어보고 다운로드하는 게 너무 번거롭다는 요청으로 추가함.
 *
 * ?label=값 을 주면 그 라벨의 세션들만, 안 주면 전체를 라벨별 폴더로 묶어서 준다.
 * 폴더 구조: {label}/{session_id}/00_background.jpg, 01_led0_Red.jpg, ...
 *            {label}/dataset.csv (해당 라벨 세션들의 RGB/fingerprint 요약)
 * 전체 다운로드일 때는 최상위에 _all_dataset.csv도 하나 더 추가한다.
 */
export async function GET(req: NextRequest) {
  const { default: JSZip } = await import("jszip");
  const label = req.nextUrl.searchParams.get("label");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("captures")
    .select("session_id, label, step_index, channel_name, r, g, b, storage_path, created_at")
    .order("label", { ascending: true })
    .order("session_id", { ascending: true })
    .order("step_index", { ascending: true })
    .range(0, 19999);

  if (label) query = query.eq("label", label);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "해당 조건에 맞는 촬영 데이터가 없습니다" }, { status: 404 });
  }

  const rows = data as CaptureRow[];
  const zip = new JSZip();
  const failures: string[] = [];

  // 라벨별로 그룹핑 (label 파라미터 없이 "전체 다운로드"할 때 폴더를 나누기 위함)
  const byLabel = new Map<string, CaptureRow[]>();
  for (const row of rows) {
    const key = row.label || "(라벨 없음)";
    if (!byLabel.has(key)) byLabel.set(key, []);
    byLabel.get(key)!.push(row);
  }

  for (const [rawLabel, labelRows] of byLabel) {
    const labelFolderName = safeName(rawLabel);
    const labelFolder = zip.folder(labelFolderName);

    for (const row of labelRows) {
      const sessionFolder = labelFolder?.folder(safeName(row.session_id));
      const filename = row.storage_path.split("/").pop() ?? `${row.step_index}.jpg`;

      const { data: fileBlob, error: downloadErr } = await supabase.storage
        .from("captures")
        .download(row.storage_path);

      if (downloadErr || !fileBlob) {
        failures.push(`${rawLabel}/${row.session_id}/${filename}: ${downloadErr?.message ?? "다운로드 실패"}`);
        continue;
      }

      const arrayBuffer = await fileBlob.arrayBuffer();
      sessionFolder?.file(filename, arrayBuffer);
    }

    // 라벨 폴더 안에 CSV 요약도 같이 넣어둔다 (ml_pipeline 학습용 데이터로 바로 쓸 수 있게).
    const sessions = groupIntoSessions(labelRows);
    labelFolder?.file("dataset.csv", sessionsToCsv(sessions));
  }

  // label 파라미터 없이 "전체 다운로드"한 경우, 모든 라벨을 합친 CSV도 최상위에 하나 더 둔다.
  if (!label) {
    const allSessions = groupIntoSessions(rows);
    zip.file("_all_dataset.csv", sessionsToCsv(allSessions));
  }

  if (failures.length > 0) {
    zip.file("_download_errors.txt", failures.join("\n"));
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  const zipFilename = `${safeName(label ?? "all_captures")}.zip`;

  // 최신 @types/node에서 Uint8Array가 제네릭(ArrayBufferLike)을 갖게 되면서,
  // DOM lib의 BodyInit(Uint8Array<ArrayBuffer> 기준)이랑 구조적으로 안 맞다고
  // 빌드 타임에 타입 에러가 난다 (Buffer로 해도 동일). 런타임에서는 Next.js가
  // Uint8Array body를 문제없이 처리하므로, 이 지점만 타입 단언으로 우회한다.
  return new NextResponse(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}
