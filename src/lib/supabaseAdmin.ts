import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버(Next.js API 라우트)에서만 쓰는 Supabase 클라이언트.
 * SERVICE ROLE KEY를 쓰므로 절대 브라우저(클라이언트 컴포넌트)에서 import하면 안 된다 —
 * 이 파일은 src/app/api/** 라우트 핸들러에서만 import해야 한다.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다 (.env.local 또는 Vercel 프로젝트 설정 확인)",
    );
  }

  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** device_state 테이블의 기본 키. supabase/schema.sql에 넣은 값과 반드시 같아야 한다. */
export const DEVICE_ID = process.env.DEVICE_ID ?? "esp32-1";

/** ESP32 ↔ 서버 사이 최소한의 인증용 공유 비밀값. ESP32 펌웨어의 DEVICE_SECRET과 동일해야 한다. */
export const DEVICE_SECRET = process.env.DEVICE_SECRET ?? "";
