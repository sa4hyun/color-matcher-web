import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * 라벨 하나의 세션들을 사진 단위로 돌려준다 (분석 화면에서 펼쳐 보기용).
 * GET /api/captures/sessions?label=xxx
 * → sessions: [{ sessionId, source, createdAt, shots: [{ stepIndex, r, g, b, pdMv }] }]
 */
export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label");
  if (!label) return NextResponse.json({ ok: false, error: "label이 필요합니다" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  let query = supabase.from("captures").select("*").order("created_at", { ascending: false }).range(0, 1999);
  query = label === "(라벨 없음)" ? query.or("label.is.null,label.eq.") : query.eq("label", label);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const bySession = new Map<
    string,
    {
      sessionId: string;
      source: string;
      createdAt: string;
      shots: Array<{ stepIndex: number; r: number; g: number; b: number; pdMv: number | null }>;
    }
  >();
  for (const row of data ?? []) {
    let s = bySession.get(row.session_id);
    if (!s) {
      s = { sessionId: row.session_id, source: row.source ?? "phone", createdAt: row.created_at, shots: [] };
      bySession.set(row.session_id, s);
    }
    if (row.created_at < s.createdAt) s.createdAt = row.created_at;
    s.shots.push({
      stepIndex: row.step_index,
      r: Number(row.r),
      g: Number(row.g),
      b: Number(row.b),
      pdMv: row.pd_mv === null || row.pd_mv === undefined ? null : Number(row.pd_mv),
    });
  }

  const sessions = Array.from(bySession.values())
    .map((s) => ({ ...s, shots: s.shots.sort((a, b) => a.stepIndex - b.stepIndex) }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ ok: true, label, sessions });
}
