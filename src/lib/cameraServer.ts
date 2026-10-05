import type { SupabaseClient } from "@supabase/supabase-js";
import { captureFileField, channelNameForStep } from "./types";

/**
 * 카메라 모듈 모드 서버 공용 유틸 (API 라우트에서만 import — service role 키 사용).
 *
 * 카메라 모듈 촬영 흐름:
 *   1) /api/camera/request  → cam_sessions에 촬영 요청 행 추가 (status='pending')
 *   2) LTE 보드가 1.5초마다 lte_poll로 요청을 가져가서 LED 6단계 촬영 + 사진 업로드 (cam_shots)
 *   3) /api/camera/session  → 브라우저가 진행 상황/결과를 폴링
 *   4) /api/camera/import   → 끝난 세션을 captures 테이블 + captures 스토리지로 복사
 *      (그래야 기존 분석 화면(/captures), zip/CSV 내보내기에 폰 촬영과 똑같이 나온다)
 */

/** PostgREST가 bytea를 돌려주는 형식("\x" + 16진수)을 바이트로 바꾼다. */
export function decodeBytea(value: unknown): Buffer {
  if (typeof value === "string" && value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex");
  }
  throw new Error("사진 데이터 형식을 알 수 없습니다");
}

/** 카메라 모듈 세션을 captures.session_id로 쓸 때의 이름 (폰 세션 id와 겹치지 않게 접두어) */
export function captureSessionIdFor(camSessionId: number): string {
  return `cam${camSessionId}`;
}


export interface ImportResult {
  ok: boolean;
  imported: number;
  total: number;
  errors: string[];
  label: string;
}

/**
 * 끝난 카메라 모듈 세션 하나를 분석 데이터(captures 테이블 + captures 스토리지)로 복사한다.
 * 사진마다 RGB와 포토다이오드 값(pd_mv)이 같이 들어간다. 같은 세션을 다시 보내면 덮어쓴다.
 * /api/camera/import(앱 버튼으로 찍은 경우)와 /api/camera/import-pending(시리얼 s로 찍어서
 * 앱이 못 가져온 세션을 나중에 한꺼번에 가져오는 경우)이 같이 쓴다.
 */
export async function importCamSession(
  supabase: SupabaseClient,
  camId: number,
  labelOverride?: string,
): Promise<ImportResult> {
  const { data: session, error: sErr } = await supabase
    .from("cam_sessions")
    .select("id, label, status")
    .eq("id", camId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!session) throw new Error(`세션 ${camId}을 찾을 수 없습니다`);

  const label = (labelOverride && labelOverride.trim()) || session.label || `카메라 세션 ${camId}`;

  const { data: shots, error: shotsErr } = await supabase
    .from("cam_shots")
    .select("step_index, r, g, b, pd_mv, jpeg, created_at")
    .eq("session_id", camId)
    .order("step_index");
  if (shotsErr) throw new Error(shotsErr.message);
  if (!shots || shots.length === 0) throw new Error("업로드된 사진이 없습니다");

  const captureSessionId = captureSessionIdFor(camId);

  // 다시 가져오는 경우를 위해 이전에 넣은 행은 지운다 (사진 파일은 upsert로 덮어씀)
  const { error: delErr } = await supabase.from("captures").delete().eq("session_id", captureSessionId);
  if (delErr) throw new Error(`${delErr.message} (supabase/camera_mode.sql을 실행했는지 확인하세요)`);

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

  if (label !== session.label) {
    await supabase.from("cam_sessions").update({ label }).eq("id", camId);
  }

  return { ok: errors.length === 0, imported, total: shots.length, errors, label };
}
