import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { decodeBytea } from "@/lib/cameraServer";

export const dynamic = "force-dynamic";

/** 카메라 모듈 사진 한 장 (JPEG). GET ?session=<id>&step=<0~5> */
export async function GET(req: NextRequest) {
  const session = Number(req.nextUrl.searchParams.get("session"));
  const step = Number(req.nextUrl.searchParams.get("step"));
  if (!Number.isInteger(session) || !Number.isInteger(step)) {
    return NextResponse.json({ ok: false, error: "session, step이 필요합니다" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cam_shots")
    .select("jpeg")
    .eq("session_id", session)
    .eq("step_index", step)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "사진이 없습니다" }, { status: 404 });

  const bytes = decodeBytea(data.jpeg);
  return new NextResponse(new Uint8Array(bytes) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      // 같은 세션/단계의 사진은 다시 찍히지 않으므로 브라우저가 캐시해도 된다
      "Cache-Control": "private, max-age=3600",
    },
  });
}
