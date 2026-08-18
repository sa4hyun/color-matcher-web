/**
 * <video> 프레임 하나를 캡처해서 (1) 화면 중앙 ROI(관심영역)의 평균 RGB와
 * (2) 전체 프레임을 JPEG Blob으로 함께 뽑는다.
 * 중앙 크롭 평균을 쓰는 이유는 Flutter 버전의 core/analysis/color_analysis.dart
 * 와 동일 — 카메라 노이즈나 프레임 가장자리 비네팅의 영향을 줄이기 위함이다.
 */
export interface CapturedFrame {
  r: number;
  g: number;
  b: number;
  /** 전체 프레임 원본 이미지 (실제 촬영 사진으로 저장/다운로드용). */
  blob: Blob;
}

export function captureFrame(
  video: HTMLVideoElement,
  roiFraction = 0.3,
  jpegQuality = 0.85,
): Promise<CapturedFrame> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    return Promise.reject(new Error("카메라 프레임이 아직 준비되지 않았습니다"));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D 캔버스 컨텍스트를 만들 수 없습니다"));

  ctx.drawImage(video, 0, 0, width, height);

  const roiW = Math.max(1, Math.round(width * roiFraction));
  const roiH = Math.max(1, Math.round(height * roiFraction));
  const x = Math.max(0, Math.round((width - roiW) / 2));
  const y = Math.max(0, Math.round((height - roiH) / 2));

  const { data } = ctx.getImageData(x, y, roiW, roiH);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
    n++;
  }
  const r = rSum / n;
  const g = gSum / n;
  const b = bSum / n;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지 변환에 실패했습니다"));
          return;
        }
        resolve({ r, g, b, blob });
      },
      "image/jpeg",
      jpegQuality,
    );
  });
}
