import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * 지금까지 클라우드(Supabase)에 올라간 촬영 세션들을 "라벨(이름)"별로 묶어서
 * 개수/최근 촬영일만 요약해서 돌려주는 엔드포인트.
 * 실제 사진 다운로드는 /api/captures/export가 담당하고, 여기는 목록 화면
 * (src/app/captures/page.tsx)에서 뭘 다운로드할 수 있는지 보여주기 위한 용도.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();

  // 세션 하나당 여러 행(배경+LED N장)이 있으므로, 목록 요약에는 최소 컬럼만 가져온다.
  // 개인 연구용 프로젝트 스케일을 넘어설 일이 없지만 혹시 몰라 넉넉히 5000행까지 조회.
  const { data, error } = await supabase
    .from("captures")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, 4999);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const byLabel = new Map<
    string,
    { label: string; sessionIds: Set<string>; cameraSessionIds: Set<string>; lastCapturedAt: string }
  >();

  for (const row of data ?? []) {
    const label = row.label || "(라벨 없음)";
    const isCamera = row.source === "camera";
    const entry = byLabel.get(label);
    if (!entry) {
      byLabel.set(label, {
        label,
        sessionIds: new Set([row.session_id]),
        cameraSessionIds: new Set(isCamera ? [row.session_id] : []),
        lastCapturedAt: row.created_at,
      });
    } else {
      entry.sessionIds.add(row.session_id);
      if (isCamera) entry.cameraSessionIds.add(row.session_id);
      if (row.created_at > entry.lastCapturedAt) entry.lastCapturedAt = row.created_at;
    }
  }

  const labels = Array.from(byLabel.values())
    .map((entry) => ({
      label: entry.label,
      sessionCount: entry.sessionIds.size,
      cameraSessionCount: entry.cameraSessionIds.size,
      lastCapturedAt: entry.lastCapturedAt,
    }))
    .sort((a, b) => (a.lastCapturedAt < b.lastCapturedAt ? 1 : -1));

  const totalSessions = new Set((data ?? []).map((row) => row.session_id)).size;

  return NextResponse.json({ ok: true, labels, totalSessions });
}
