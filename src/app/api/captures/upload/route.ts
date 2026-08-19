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
  const errors: string[] = [];

  // 사진 한 장이 실패해도 나머지는 계속 시도한다 (예전엔 하나 실패하면 바로
  // 중단해서, 왜 일부만 올라가고 나머지는 하나도 안 올라가는지 알기 어려웠음).
  for (const meta of shotsMeta) {
    const file = form.get(meta.fileField);
    if (!(file instanceof File)) {
      errors.push(`${meta.fileField}: 파일을 찾지 못함`);
      continue;
    }

    const path = `${sessionId}/${meta.fileField}.jpg`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from("captures")
      .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });

    if (uploadErr) {
      errors.push(`${meta.fileField} 스토리지 업로드 실패: ${uploadErr.message}`);
      continue;
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
      errors.push(`${meta.fileField} 메타데이터 저장 실패: ${insertErr.message}`);
      continue;
    }

    uploaded++;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    uploaded,
    total: shotsMeta.length,
    errors,
  });
}
