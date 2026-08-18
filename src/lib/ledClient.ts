/**
 * 브라우저 쪽에서 클라우드 릴레이(/api/device/*)를 호출하는 클라이언트.
 *
 * 예전 버전(로컬 Wi-Fi)은 브라우저가 /api/led 프록시를 통해 ESP32와 거의 즉시
 * 통신했지만, 지금은 ESP32가 LTE로 클라우드(Supabase)를 폴링하는 구조라서
 * "명령을 보낸다" ≠ "즉시 적용된다"이다. LTE 왕복은 평균 5~6초, 최대 10초
 * 안팎으로 느리고 편차도 크므로, 고정 딜레이 대신 실제로 적용됐다는 응답
 * (appliedId === commandId)을 받을 때까지 폴링해서 기다린다.
 */

export interface DeviceStatus {
  desiredChannel: number;
  commandId: number;
  appliedId: number;
  appliedChannel: number;
  appliedAt: string | null;
  lastSeenAt: string | null;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? `요청 실패 (HTTP ${res.status})`);
  return data as T;
}

export async function getStatus(): Promise<DeviceStatus> {
  const res = await fetch("/api/device/status", { cache: "no-store" });
  return parseJsonResponse<DeviceStatus>(res);
}

async function postCommand(channel: number): Promise<number> {
  const res = await fetch("/api/device/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
    cache: "no-store",
  });
  const data = await parseJsonResponse<{ commandId: number }>(res);
  return data.commandId;
}

/**
 * channel: -1 = 전체 OFF(배경), 0~2 = 해당 LED만 ON.
 * 명령을 보낸 뒤, ESP32가 LTE로 그 명령을 가져가 실행하고 ack할 때까지
 * /api/device/status를 폴링하며 기다린다.
 */
export async function setChannelAndWait(
  channel: number,
  opts?: { timeoutMs?: number; pollMs?: number; onTick?: (elapsedMs: number) => void },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 60000;
  const pollMs = opts?.pollMs ?? 1500;
  const commandId = await postCommand(channel);

  const start = Date.now();
  for (;;) {
    const elapsed = Date.now() - start;
    opts?.onTick?.(elapsed);
    if (elapsed > timeoutMs) {
      throw new Error(
        "ESP32 응답 대기 시간이 초과됐습니다 (LTE 신호가 약하거나 기기 전원이 꺼져 있을 수 있어요)",
      );
    }

    const status = await getStatus();
    if (status.appliedId >= commandId && status.appliedChannel === channel) {
      return;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
