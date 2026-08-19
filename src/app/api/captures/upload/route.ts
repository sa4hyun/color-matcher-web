import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * 브라우저가 촬영 세션을 저장(라벨 입력 후 "저장")할 때 같이 호출하는 업로드 엔드포인트.
 * 사진 파일들 + 메타데이터(JSON)를 multipart/form-data로 받아서
 * Supabase Storage(captures 버킷)에 올리고, captures 테이블에 한 장당 한 행씩 기록한다.
 *
 * 서버 라우트 안에서만 SUPABASE_SERVICE_ROLE_KEY를 쓰기 때문에, 브라우저 쪽에는
 * 별도 Supabase 키를 노출할 필요가 없다 (src/lib/cloudUpload.ts 참고).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "요청 본문을 읽을 수 없습니다" }, { status: 400 });
  }

  const sessionId = form.get("sessionId");
  const label = form.get("label");
  const shotsMetaRaw = form.get("shotsMeta");

  if (typeof sessionId !== "string" || typeof label !== "string" || typeof shotsMetaRaw !== "string") {
    return NextResponse.json({ ok: false, error: "sessionId/label/shotsMeta가 필요합니다" }, { status: 400 });
  }

  let shotsMeta: Array<{ stepIndex: number; r: number; g: number; b: number; channelName: string; fileField: string }>;
  try {
    shotsMeta = JSON.parse(shotsMetaRaw);
  } catch {
    return NextResponse.json({ ok: false, error: "shotsMeta JSON 파싱 실패" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let uploaded = 0;

  for (const meta of shotsMeta) {
    const file = form.get(meta.fileField);
    if (!(file instanceof File)) continue;

    const path = `${sessionId}/${meta.fileField}.jpg`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from("captures")
      .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });

    if (uploadErr) {
      return NextResponse.json(
        { ok: false, error: `스토리지 업로드 실패 (${meta.fileField}): ${uploadErr.message}` },
        { status: 500 },
      );
    }

    const { error: insertErr } = await supabase.from("captures").insert({
      session_id: sessionId,
      label,
      step_index: meta.stepIndex,
      channel_name: meta.channelName,
      r: meta.r,
      g: meta.g,
      b: meta.b,
      storage_path: path,
    });

    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: `메타데이터 저장 실패 (${meta.fileField}): ${insertErr.message}` },
        { status: 500 },
      );
    }

    uploaded++;
  }

  return NextResponse.json({ ok: true, uploaded });
}
