import { CaptureSession, LED_CHANNEL_NAMES, captureFileField, computeFingerprint } from "./types";

/**
 * CSV 변환 유틸리티. 실제 저장/불러오기는 lib/db.ts(IndexedDB)가 담당하고,
 * 여기는 이미 로드된 세션 목록을 CSV 텍스트로 바꾸는 순수 함수만 모아둔다.
 * 이미지(Blob)는 CSV에 포함하지 않는다 — RGB/fingerprint만 내보낸다.
 */

function csvHeaderRow(): string[] {
  const cols = ["session_id", "label", "created_at", "bg_r", "bg_g", "bg_b"];
  LED_CHANNEL_NAMES.forEach((_, i) => cols.push(`ch${i}_r`, `ch${i}_g`, `ch${i}_b`));
  LED_CHANNEL_NAMES.forEach((_, i) => cols.push(`norm_ch${i}_r`, `norm_ch${i}_g`, `norm_ch${i}_b`));
  // 2026-09 추가: 촬영 방식 + 포토다이오드. 기존 칸 순서를 안 바꾸려고 맨 뒤에 붙인다
  // (ml_pipeline 등 기존 분석 코드가 칸 위치로 읽어도 깨지지 않게).
  cols.push("source", "bg_pd_mv");
  LED_CHANNEL_NAMES.forEach((_, i) => cols.push(`ch${i}_pd_mv`));
  return cols;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function sessionsToCsv(sessions: CaptureSession[]): string {
  const header = csvHeaderRow();
  const lines = [header.join(",")];

  for (const session of sessions) {
    const bg = session.shots.find((s) => s.stepIndex === 0);
    const ledShots = session.shots
      .filter((s) => s.stepIndex !== 0)
      .sort((a, b) => a.stepIndex - b.stepIndex);
    const fingerprint = computeFingerprint(session.shots);

    const row: (string | number)[] = [
      session.id,
      session.label,
      session.createdAt,
      bg?.r ?? "",
      bg?.g ?? "",
      bg?.b ?? "",
    ];
    for (const shot of ledShots) row.push(shot.r, shot.g, shot.b);
    for (const value of fingerprint) row.push(value);
    row.push(session.source ?? "phone", bg?.pdMv ?? "");
    LED_CHANNEL_NAMES.forEach((_, i) => {
      const shot = ledShots.find((s) => s.stepIndex === i + 1);
      row.push(shot?.pdMv ?? "");
    });

    lines.push(row.map(csvEscape).join(","));
  }

  return lines.join("\n");
}

export function downloadCsv(sessions: CaptureSession[], filename = "dataset.csv") {
  const csv = sessionsToCsv(sessions);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 세션 하나의 촬영 이미지들을 zip으로 묶어 다운로드한다 (실제 데이터셋용 원본 사진). */
export async function downloadSessionImagesZip(session: CaptureSession) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folderName = (session.label || session.id).replace(/[\\/:*?"<>|]/g, "_");
  const folder = zip.folder(folderName);

  const sorted = [...session.shots].sort((a, b) => a.stepIndex - b.stepIndex);
  for (const shot of sorted) {
    if (!shot.imageBlob) continue;
    const name = `${captureFileField(shot.stepIndex)}.jpg`;
    folder?.file(name, shot.imageBlob);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folderName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
