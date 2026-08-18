import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DEVICE_ID } from "@/lib/supabaseAdmin";

/**
 * 브라우저(폰)가 "이 채널을 켜줘"라고 요청하는 엔드포인트.
 * 실제로 ESP32에 전달하는 게 아니라, Supabase의 device_state 행에 "원하는 채널"과
 * command_id(매번 +1)만 기록해둔다 — ESP32는 LTE로 이 값을 스스로 폴링해서 가져간다
 * (src/app/api/device/poll/route.ts, ESP32 쪽은 esp32_firmware/src/main.cpp 참고).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const channel = body?.channel;

  if (typeof channel !== "number" || !Number.isInteger(channel) || channel < -1 || channel > 2) {
    return NextResponse.json({ ok: false, error: "channel은 -1~2 사이의 정수여야 합니다" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: current, error: readErr } = await supabase
    .from("device_state")
    .select("command_id")
    .eq("device_id", DEVICE_ID)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "device_state에 해당 device_id 행이 없습니다 (supabase/schema.sql을 실행했는지, DEVICE_ID가 일치하는지 확인하세요)" },
      { status: 404 },
    );
  }

  const nextCommandId = (current.command_id ?? 0) + 1;

  const { error: updateErr } = await supabase
    .from("device_state")
    .update({
      desired_channel: channel,
      command_id: nextCommandId,
      updated_at: new Date().toISOString(),
    })
    .eq("device_id", DEVICE_ID);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, commandId: nextCommandId });
}
