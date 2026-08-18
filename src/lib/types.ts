/**
 * esp32_firmware/src/main.cpp 의 LED_PINS 순서와 반드시 같아야 한다.
 * GPIO 14 → Red(ch0), GPIO 13 → Green(ch1), GPIO 12 → Blue(ch2).
 * 배선 색이 바뀌면 이 배열과 esp32_firmware의 LED_PINS를 함께 맞춰서 바꾸면 된다.
 */
export const LED_CHANNEL_NAMES = ["Red", "Green", "Blue"] as const;
export const LED_GPIO_PINS = [14, 13, 12] as const;

export const LED_CHANNEL_HEX: Record<(typeof LED_CHANNEL_NAMES)[number], string> = {
  Red: "#EF4444",
  Green: "#22C55E",
  Blue: "#3B82F6",
};

/** 촬영 1장의 raw 결과 (배경 또는 특정 LED 채널) */
export interface RawShot {
  stepIndex: number; // 0 = 배경, 1..N = LED
  r: number;
  g: number;
  b: number;
  /**
   * 촬영된 원본 이미지(JPEG). IndexedDB(lib/db.ts)에는 그대로 저장되지만,
   * CSV로 내보낼 때는 포함되지 않는다 (RGB/fingerprint만 내보냄).
   */
  imageBlob?: Blob;
}

/** 촬영 세션 하나 (배경 1장 + LED N장) */
export interface CaptureSession {
  id: string;
  createdAt: string; // ISO
  label: string;
  shots: RawShot[]; // length = LED_CHANNEL_NAMES.length + 1
}

export function isSessionComplete(shots: RawShot[]): boolean {
  return shots.length === LED_CHANNEL_NAMES.length + 1;
}

/**
 * docs 의 정규화 공식과 동일: normalized = (sample - background) / (background + epsilon)
 * 반환 벡터는 [ch0_r, ch0_g, ch0_b, ch1_r, ..., ch(N-1)_b] 순서, LED 3개 기준 9차원.
 */
export function computeFingerprint(shots: RawShot[], epsilon = 1.0): number[] {
  const bg = shots.find((s) => s.stepIndex === 0);
  if (!bg) return [];
  const ledShots = shots
    .filter((s) => s.stepIndex !== 0)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  const out: number[] = [];
  for (const shot of ledShots) {
    out.push((shot.r - bg.r) / (bg.r + epsilon));
    out.push((shot.g - bg.g) / (bg.g + epsilon));
    out.push((shot.b - bg.b) / (bg.b + epsilon));
  }
  return out;
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}
