/**
 * 카메라 모듈 모드 서버 공용 유틸 (API 라우트에서만 import — service role 키 사용).
 *
 * 카메라 모듈 촬영 흐름:
 *   1) /api/camera/request  → cam_sessions에 촬영 요청 행 추가 (status='pending')
 *   2) LTE 보드가 1.5초마다 lte_poll로 요청을 가져가서 LED 6단계 촬영 + 사진 업로드 (cam_shots)
 *   3) /api/camera/session  → 브라우저가 진행 상황/결과를 폴링
 *   4) /api/camera/import   → 끝난 세션을 captures 테이블 + captures 스토리지로 복사
 *      (그래야 기존 분석 화면(/captures), zip/CSV 내보내기에 폰 촬영과 똑같이 나온다)
 */

/** PostgREST가 bytea를 돌려주는 형식("\x" + 16진수)을 바이트로 바꾼다. */
export function decodeBytea(value: unknown): Buffer {
  if (typeof value === "string" && value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex");
  }
  throw new Error("사진 데이터 형식을 알 수 없습니다");
}

/** 카메라 모듈 세션을 captures.session_id로 쓸 때의 이름 (폰 세션 id와 겹치지 않게 접두어) */
export function captureSessionIdFor(camSessionId: number): string {
  return `cam${camSessionId}`;
}
