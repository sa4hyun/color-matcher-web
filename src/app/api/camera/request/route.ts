import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DEVICE_ID } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * 카메라 모듈 촬영 요청. cam_sessions에 status='pending' 행을 하나 넣으면
 * LTE 보드가 다음 폴링(최대 1.5초 + LTE 왕복)에서 가져가 촬영을 시작한다.
 * body: { label: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ ok: false, error: "라벨(색상 이름)을 입력하세요" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 이미 대기/촬영 중인 요청이 있으면 새로 만들지 않는다 (버튼 연타 방지)
  const { data: busy, error: busyErr } = await supabase
    .from("cam_sessions")
    .select("id, status")
    .eq("device_id", DEVICE_ID)
    .in("status", ["pending", "running"])
    .gte("requested_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(1);
  if (busyErr) {
    return NextResponse.json(
      { ok: false, error: `${busyErr.message} (cam_schema.sql을 실행했는지 확인하세요)` },
      { status: 500 },
    );
  }
  if (busy && busy.length > 0) {
    return NextResponse.json(
      { ok: false, error: `이미 진행 중인 촬영이 있습니다 (세션 ${busy[0].id}, ${busy[0].status})`, sessionId: busy[0].id },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("cam_sessions")
    .insert({ device_id: DEVICE_ID, label })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "요청 생성 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessionId: data.id });
}
