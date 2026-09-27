/**
 * esp32_firmware/src/main.cpp 의 LED_PINS 순서와 반드시 같아야 한다.
 * GPIO 14 → 빨강(ch0), GPIO 13 → 하양(ch1), GPIO 12 → 초록(ch2),
 * GPIO 36 → 파랑(ch3), GPIO 37 → 주황(ch4). (실측 배선 기준 — 직접 설계/지정)
 *
 * 히스토리: 원래 최종 설계는 5개였는데, 중간에 LED6~10(GPIO 21/47/48/38/39)까지
 * 10개로 확장했다가 (2026-08-27) 부품비 문제로 다시 원래 5개로 되돌렸다
 * (2026-09-09). LED4/LED5는 GPIO19/20(USB D-/D+와 물리적으로 겹쳐서 USB 인식
 * 자체가 안 됨, 확인됨) → GPIO0/45(부팅 스트래핑 핀이라 위험) → GPIO26/27
 * (빌드 타깃상 빈 핀으로 보였으나 실제 보드 헤더에 안 나와 있음) 순으로
 * 시도하다, 보드 헤더에 실제로 나와 있는 GPIO36/37로 최종 확정했다.
 * 배선이 또 바뀌면 이 배열과 esp32_firmware의 LED_PINS를 함께 맞춰서 바꾸면 된다.
 */
// 실제 배선 색 (2026-09-27 확인): GPIO14=빨강, 13=하양, 12=초록, 36=파랑, 37=주황.
// 예전엔 이름이 Red/Green/Blue/LED4/LED5로 한 칸씩 밀려 있었다. 이미 저장된 데이터의
// channel_name에는 옛 이름이 남아 있을 수 있지만, 분석(CSV)은 이름이 아니라 순서(ch0~ch4)로
// 하므로 영향이 없다.
export const LED_CHANNEL_NAMES = ["Red", "White", "Green", "Blue", "Orange"] as const;
export const LED_CHANNEL_LABELS_KO = ["빨강", "하양", "초록", "파랑", "주황"] as const;
export const LED_GPIO_PINS = [14, 13, 12, 36, 37] as const;

export const LED_CHANNEL_HEX: Record<(typeof LED_CHANNEL_NAMES)[number], string> = {
  Red: "#EF4444",
  White: "#E5E7EB",
  Green: "#22C55E",
  Blue: "#3B82F6",
  Orange: "#F97316",
};

/** 촬영 방식: 폰 카메라(기존) 또는 카메라 모듈(Freenove 보드, LTE 보드가 직접 촬영) */
export type CaptureSource = "phone" | "camera";

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
  /** 촬영 직전 1초 동안의 포토다이오드 평균 (mV). 측정값이 없으면 undefined. */
  pdMv?: number;
}

/** 촬영 세션 하나 (배경 1장 + LED N장) */
export interface CaptureSession {
  id: string;
  createdAt: string; // ISO
  label: string;
  shots: RawShot[]; // length = LED_CHANNEL_NAMES.length + 1
  /** 촬영 방식. 예전 데이터는 없을 수 있음 → "phone"으로 간주 */
  source?: CaptureSource;
}

export function isSessionComplete(shots: RawShot[]): boolean {
  return shots.length === LED_CHANNEL_NAMES.length + 1;
}

/**
 * docs 의 정규화 공식과 동일: normalized = (sample - background) / (background + epsilon)
 * 반환 벡터는 [ch0_r, ch0_g, ch0_b, ch1_r, ..., ch(N-1)_b] 순서, LED 5개 기준 15차원.
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

/** step 번호 → 채널 이름 ("background" 또는 LED_CHANNEL_NAMES 중 하나) */
export function channelNameForStep(stepIndex: number): string {
  return stepIndex === 0 ? "background" : LED_CHANNEL_NAMES[stepIndex - 1] ?? `step${stepIndex}`;
}

/**
 * Storage에 올릴 사진 파일 이름 (확장자 제외). 폰/카메라 모듈 둘 다 같은 규칙을 쓴다.
 * 00_background, 01_led0_Red, 02_led1_White, ...
 */
export function captureFileField(stepIndex: number): string {
  const channelName = channelNameForStep(stepIndex);
  return stepIndex === 0
    ? "00_background"
    : `${String(stepIndex).padStart(2, "0")}_led${stepIndex - 1}_${channelName}`;
}
