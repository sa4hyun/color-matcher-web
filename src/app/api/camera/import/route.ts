import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { captureSessionIdFor, decodeBytea } from "@/lib/cameraServer";
import { captureFileField, channelNameForStep } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 끝난 카메라 모듈 세션을 분석 데이터(captures 테이블 + captures 스토리지)로 복사한다.
 * 폰 촬영과 같은 형식(파일 이름, 칸)으로 들어가서 /captures 화면과 zip/CSV 내보내기에 그대로 나온다.
 * source='camera', pd_mv(포토다이오드), cam_session_id(원본 세션)가 같이 저장된다.
 * body: { sessionId: number, label?: string }  — label을 주면 그 이름으로 저장 (없으면 요청 때 이름)
 * 같은 세션을 다시 보내면 덮어쓴다 (중복 행이 생기지 않음).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const camId = Number(body?.sessionId);
  if (!Number.isInteger(camId) || camId <= 0) {
    return NextResponse.json({ ok: false, error: "sessionId가 필요합니다" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: session, error: sErr } = await supabase
    .from("cam_sessions")
    .select("id, label, status")
    .eq("id", camId)
    .maybeSingle();
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ ok: false, error: `세션 ${camId}을 찾을 수 없습니다` }, { status: 404 });

  const label = (typeof body?.label === "string" && body.label.trim()) || session.label || "";
  if (!label) return NextResponse.json({ ok: false, error: "라벨이 없습니다" }, { status: 400 });

  const { data: shots, error: shotsErr } = await supabase
    .from("cam_shots")
    .select("step_index, r, g, b, pd_mv, jpeg, created_at")
    .eq("session_id", camId)
    .order("step_index");
  if (shotsErr) return NextResponse.json({ ok: false, error: shotsErr.message }, { status: 500 });
  if (!shots || shots.length === 0) {
    return NextResponse.json({ ok: false, error: "업로드된 사진이 없습니다" }, { status: 400 });
  }

  const captureSessionId = captureSessionIdFor(camId);

  // 다시 가져오는 경우를 위해 이전에 넣은 행은 지운다 (사진 파일은 upsert로 덮어씀)
  const { error: delErr } = await supabase.from("captures").delete().eq("session_id", captureSessionId);
  if (delErr) {
    return NextResponse.json(
      { ok: false, error: `${delErr.message} (supabase/camera_mode.sql을 실행했는지 확인하세요)` },
      { status: 500 },
    );
  }

  let imported = 0;
  const errors: string[] = [];
  for (const shot of shots) {
    const fileField = captureFileField(shot.step_index);
    const path = `${captureSessionId}/${fileField}.jpg`;
    try {
      const bytes = decodeBytea(shot.jpeg);
      const { error: upErr } = await supabase.storage
        .from("captures")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(`스토리지 업로드 실패: ${upErr.message}`);

      const { error: insErr } = await supabase.from("captures").insert({
        session_id: captureSessionId,
        label,
        step_index: shot.step_index,
        channel_name: channelNameForStep(shot.step_index),
        r: shot.r,
        g: shot.g,
        b: shot.b,
        storage_path: path,
        source: "camera",
        pd_mv: shot.pd_mv,
        cam_session_id: camId,
      });
      if (insErr) throw new Error(`메타데이터 저장 실패: ${insErr.message}`);
      imported++;
    } catch (e) {
      errors.push(`${fileField}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 요청 때와 다른 라벨로 저장했으면 원본 세션 이름도 맞춰둔다
  if (label !== session.label) {
    await supabase.from("cam_sessions").update({ label }).eq("id", camId);
  }

  return NextResponse.json({ ok: errors.length === 0, imported, total: shots.length, errors, label });
}
