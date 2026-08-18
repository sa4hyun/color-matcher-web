import { NextRequest } from "next/server";
import { getSupabaseAdmin, DEVICE_ID, DEVICE_SECRET } from "@/lib/supabaseAdmin";

/**
 * ESP32가 "명령 N번, 채널 M을 실제로 켰다"고 확인(ack)해주는 엔드포인트.
 * GET으로 만든 이유: AT+QHTTPPOST로 body를 보내는 것보다 쿼리스트링에 얹어
 * AT+QHTTPGET 한 번으로 끝내는 게 ESP32 쪽 AT 명령 시퀀스가 훨씬 단순해지기 때문
 * (LTE 왕복이 평균 5~6초로 느려서, 요청 자체를 최대한 단순하게 유지하는 게 중요하다).
 *
 * 예: GET /api/device/ack?secret=...&command_id=7&channel=2
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (!DEVICE_SECRET || secret !== DEVICE_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const commandId = Number(searchParams.get("command_id"));
  const channel = Number(searchParams.get("channel"));
  if (!Number.isFinite(commandId) || !Number.isFinite(channel)) {
    return new Response("bad request", { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("device_state")
    .update({
      applied_id: commandId,
      applied_channel: channel,
      applied_at: now,
      device_seen_at: now,
    })
    .eq("device_id", DEVICE_ID);

  if (error) {
    return new Response("error", { status: 500 });
  }

  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
