import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 카메라 모듈 촬영 세션의 진행 상황 + 지금까지 올라온 사진 정보(사진 자체는 제외).
 * GET ?id=<cam_sessions.id>
 * 사진은 /api/camera/shot?session=<id>&step=<0~5> 로 따로 받는다.
 */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "id가 필요합니다" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: session, error } = await supabase
    .from("cam_sessions")
    .select("id, label, status, message, requested_at, started_at, finished_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!session) return NextResponse.json({ ok: false, error: `세션 ${id}을 찾을 수 없습니다` }, { status: 404 });

  const { data: shots, error: shotsErr } = await supabase
    .from("cam_shots")
    .select("step_index, r, g, b, pd_mv, jpeg_bytes, created_at")
    .eq("session_id", id)
    .order("step_index");
  if (shotsErr) return NextResponse.json({ ok: false, error: shotsErr.message }, { status: 500 });

  // 분석 데이터(captures)로 이미 옮겼는지
  const { count } = await supabase
    .from("captures")
    .select("id", { count: "exact", head: true })
    .eq("cam_session_id", id);

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      label: session.label,
      status: session.status as "pending" | "running" | "done" | "error",
      message: session.message,
      requestedAt: session.requested_at,
      startedAt: session.started_at,
      finishedAt: session.finished_at,
    },
    shots: (shots ?? []).map((s) => ({
      stepIndex: s.step_index,
      r: Number(s.r),
      g: Number(s.g),
      b: Number(s.b),
      pdMv: s.pd_mv === null ? null : Number(s.pd_mv),
      jpegBytes: s.jpeg_bytes,
    })),
    importedCount: count ?? 0,
  });
}
