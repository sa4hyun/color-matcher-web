import { CaptureSession, LED_CHANNEL_NAMES } from "./types";

/**
 * 촬영 세션(배경 1장 + LED N장)을 서버(/api/captures/upload)를 거쳐
 * Supabase Storage + captures 테이블에 업로드한다.
 * 파일명 규칙은 lib/dataset.ts의 downloadSessionImagesZip과 동일하게 맞춰뒀다
 * (00_background.jpg, 01_led0_Red.jpg, ...).
 */
export async function uploadSessionToCloud(session: CaptureSession): Promise<void> {
  const sorted = [...session.shots].sort((a, b) => a.stepIndex - b.stepIndex);

  const shotsMeta = sorted
    .filter((shot) => !!shot.imageBlob)
    .map((shot) => {
      const channelName = shot.stepIndex === 0 ? "background" : LED_CHANNEL_NAMES[shot.stepIndex - 1] ?? "";
      const fileField =
        shot.stepIndex === 0
          ? "00_background"
          : `${String(shot.stepIndex).padStart(2, "0")}_led${shot.stepIndex - 1}_${channelName}`;
      return { stepIndex: shot.stepIndex, r: shot.r, g: shot.g, b: shot.b, channelName, fileField };
    });

  const form = new FormData();
  form.append("sessionId", session.id);
  form.append("label", session.label);
  form.append("shotsMeta", JSON.stringify(shotsMeta));

  for (const shot of sorted) {
    if (!shot.imageBlob) continue;
    const channelName = shot.stepIndex === 0 ? "background" : LED_CHANNEL_NAMES[shot.stepIndex - 1] ?? "";
    const fileField =
      shot.stepIndex === 0
        ? "00_background"
        : `${String(shot.stepIndex).padStart(2, "0")}_led${shot.stepIndex - 1}_${channelName}`;
    form.append(fileField, shot.imageBlob, `${fileField}.jpg`);
  }

  const res = await fetch("/api/captures/upload", { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `업로드 실패 (HTTP ${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(data.error || "업로드 실패");
  }
}
