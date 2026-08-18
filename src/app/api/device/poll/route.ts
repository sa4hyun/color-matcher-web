import { NextRequest } from "next/server";
import { getSupabaseAdmin, DEVICE_ID, DEVICE_SECRET } from "@/lib/supabaseAdmin";

/**
 * ESP32가 LTE(AT+QHTTPGET)로 주기적으로 호출하는 엔드포인트.
 * ESP32 쪽 AT 명령으로 JSON을 파싱하기 번거로우므로 일부러 아주 단순한
 * "채널,명령ID" 평문(text/plain)만 리턴한다. 예: "2,7" (채널 2를 켜라, 명령ID 7)
 *
 * 호출할 때마다 device_seen_at을 갱신해서, 앱 쪽에서 "ESP32가 최근에 살아있었는지"
 * 확인할 수 있게 한다 (명령이 없어도 매번 갱신됨).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (!DEVICE_SECRET || secret !== DEVICE_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("device_state")
    .select("desired_channel, command_id")
    .eq("device_id", DEVICE_ID)
    .maybeSingle();

  // 명령 조회 성공 여부와 무관하게 "방금 폴링했다"는 사실은 기록해둔다.
  await supabase
    .from("device_state")
    .update({ device_seen_at: new Date().toISOString() })
    .eq("device_id", DEVICE_ID);

  if (error || !data) {
    // 조회 실패 시 안전한 기본값(전체 OFF, 명령ID 0)을 돌려준다.
    return new Response("-1,0", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response(`${data.desired_channel},${data.command_id}`, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
