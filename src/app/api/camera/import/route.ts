import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { importCamSession } from "@/lib/cameraServer";

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
  try {
    const result = await importCamSession(
      getSupabaseAdmin(),
      camId,
      typeof body?.label === "string" ? body.label : undefined,
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
