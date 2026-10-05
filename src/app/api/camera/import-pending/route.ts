import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { importCamSession } from "@/lib/cameraServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 아직 분석 데이터(captures)로 안 옮겨진 카메라 모듈 세션을 찾아서 한꺼번에 옮긴다.
 *
 * 왜 필요한가: 앱 버튼으로 찍으면 촬영 화면이 끝나자마자 /api/camera/import를 부르지만,
 * LTE 보드 시리얼에서 's'로 찍거나, 촬영 도중 앱을 닫으면 그 세션은 cam_shots에만 있고
 * captures에는 안 들어간다 → 분석 화면에서 사진/포토다이오드 값이 안 보이는 원인.
 * /captures 화면이 열릴 때마다 이걸 먼저 불러서 빠진 세션을 채운다.
 *
 * 대상: status가 done인 세션 + error여도 사진이 6장 다 올라온 세션.
 * 한 번에 최대 MAX_PER_CALL개 (나머지는 다음 호출 때).
 */
const MAX_PER_CALL = 5;

export async function POST() {
  const supabase = getSupabaseAdmin();

  const { data: sessions, error } = await supabase
    .from("cam_sessions")
    .select("id, status")
    .in("status", ["done", "error"])
    .order("id", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!sessions || sessions.length === 0) return NextResponse.json({ ok: true, imported: [], remaining: 0 });

  const ids = sessions.map((s) => s.id as number);

  // 이미 captures에 들어간 세션
  const { data: existing, error: exErr } = await supabase
    .from("captures")
    .select("cam_session_id")
    .in("cam_session_id", ids);
  if (exErr) {
    return NextResponse.json(
      { ok: false, error: `${exErr.message} (supabase/camera_mode.sql을 실행했는지 확인하세요)` },
      { status: 500 },
    );
  }
  const done = new Set((existing ?? []).map((r) => Number(r.cam_session_id)));

  // 사진이 하나라도 있는 세션만 (요청만 하고 촬영 안 된 세션 제외)
  const candidates = ids.filter((id) => !done.has(id));
  if (candidates.length === 0) return NextResponse.json({ ok: true, imported: [], remaining: 0 });

  const { data: shotRows, error: shErr } = await supabase
    .from("cam_shots")
    .select("session_id, step_index")
    .in("session_id", candidates);
  if (shErr) return NextResponse.json({ ok: false, error: shErr.message }, { status: 500 });
  const shotCount = new Map<number, number>();
  for (const r of shotRows ?? []) shotCount.set(Number(r.session_id), (shotCount.get(Number(r.session_id)) ?? 0) + 1);

  const statusOf = new Map(sessions.map((s) => [s.id as number, s.status as string]));
  const todo = candidates.filter((id) => {
    const n = shotCount.get(id) ?? 0;
    return statusOf.get(id) === "done" ? n > 0 : n >= 6;
  });

  const imported: Array<{ id: number; label: string; count: number }> = [];
  const errors: string[] = [];
  for (const id of todo.slice(0, MAX_PER_CALL)) {
    try {
      const r = await importCamSession(supabase, id);
      imported.push({ id, label: r.label, count: r.imported });
      errors.push(...r.errors.map((m) => `세션 ${id} ${m}`));
    } catch (e) {
      errors.push(`세션 ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    imported,
    errors,
    remaining: Math.max(0, todo.length - MAX_PER_CALL),
  });
}
