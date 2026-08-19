import { NextResponse } from "next/server";
import { getSupabaseAdmin, DEVICE_ID } from "@/lib/supabaseAdmin";

// 이 라우트는 request 객체를 안 써서 Next.js가 빌드 시점에 정적으로
// 캐싱해버릴 수 있다 (그러면 배포 이후 DB가 바뀌어도 항상 같은 옛날 값만
// 리턴됨). 매 요청마다 새로 실행되도록 강제로 dynamic 처리한다.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 브라우저가 "ESP32가 명령을 실제로 적용했는지" 폴링하는 엔드포인트.
 * appliedId >= commandId 이고 appliedChannel이 요청한 채널과 같아지면
 * "LED가 실제로 켜졌다"고 판단해도 된다 (src/lib/ledClient.ts의 setChannelAndWait 참고).
 * lastSeenAt은 ESP32가 마지막으로 폴링(/api/device/poll)한 시각 — 이게 오래됐으면
 * ESP32가 꺼져있거나 LTE 신호가 안 잡히는 상태로 볼 수 있다.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("device_state")
    .select("desired_channel, command_id, applied_id, applied_channel, applied_at, device_seen_at")
    .eq("device_id", DEVICE_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "device_state에 해당 device_id 행이 없습니다 (supabase/schema.sql 실행 여부 확인)" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    desiredChannel: data.desired_channel,
    commandId: data.command_id,
    appliedId: data.applied_id,
    appliedChannel: data.applied_channel,
    appliedAt: data.applied_at,
    lastSeenAt: data.device_seen_at,
  });
}
