import { CaptureSession, LED_CHANNEL_NAMES } from "./types";

export interface CloudUploadResult {
  uploaded: number;
  total: number;
  errors: string[];
}

function fileFieldFor(stepIndex: number, channelName: string): string {
  return stepIndex === 0
    ? "00_background"
    : `${String(stepIndex).padStart(2, "0")}_led${stepIndex - 1}_${channelName}`;
}

/**
 * 촬영 세션(배경 1장 + LED N장)을 서버(/api/captures/upload)를 거쳐
 * Supabase Storage + captures 테이블에 업로드한다.
 * 파일명 규칙은 lib/dataset.ts의 downloadSessionImagesZip과 동일하게 맞춰뒀다
 * (00_background.jpg, 01_led0_Red.jpg, ...).
 *
 * 네트워크/서버 오류(응답 자체를 못 받음)일 때만 예외를 던진다. 사진 일부만
 * 실패한 경우는 예외 대신 결과 객체(errors 배열 포함)로 알려준다 — 호출하는
 * 쪽(useCaptureController)에서 이 반환값을 바로 써야 한다. await 직후 훅의
 * state를 다시 읽으면 그 값이 아직 리렌더 전이라 오래된 값일 수 있기 때문이다.
 */
export async function uploadSessionToCloud(session: CaptureSession): Promise<CloudUploadResult> {
  const sorted = [...session.shots].sort((a, b) => a.stepIndex - b.stepIndex);
  const withBlob = sorted.filter((shot) => !!shot.imageBlob);

  const shotsMeta = withBlob.map((shot) => {
    const channelName = shot.stepIndex === 0 ? "background" : LED_CHANNEL_NAMES[shot.stepIndex - 1] ?? "";
    return {
      stepIndex: shot.stepIndex,
      r: shot.r,
      g: shot.g,
      b: shot.b,
      channelName,
      fileField: fileFieldFor(shot.stepIndex, channelName),
    };
  });

  const form = new FormData();
  form.append("sessionId", session.id);
  form.append("label", session.label);
  form.append("shotsMeta", JSON.stringify(shotsMeta));

  for (const shot of withBlob) {
    const channelName = shot.stepIndex === 0 ? "background" : LED_CHANNEL_NAMES[shot.stepIndex - 1] ?? "";
    const fileField = fileFieldFor(shot.stepIndex, channelName);
    form.append(fileField, shot.imageBlob as Blob, `${fileField}.jpg`);
  }

  const res = await fetch("/api/captures/upload", { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `업로드 요청 실패 (HTTP ${res.status})`);
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    throw new Error("업로드 응답을 해석할 수 없습니다");
  }

  return {
    uploaded: data.uploaded ?? 0,
    total: data.total ?? shotsMeta.length,
    errors: data.errors ?? (data.ok ? [] : [data.error ?? "알 수 없는 오류"]),
  };
}
