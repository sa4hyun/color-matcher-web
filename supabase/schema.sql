-- ColorMatcher 클라우드 릴레이용 스키마.
-- Supabase 프로젝트의 SQL Editor에서 이 파일 내용을 그대로 실행하세요.
--
-- 역할: "지금 몇 번 LED를 켜라"는 명령 큐 + ESP32가 실제로 적용했는지 확인(ack)을
-- 저장하는 딱 하나의 테이블. 사진 자체는 브라우저(getUserMedia)에서 그대로
-- 로컬로 찍고 IndexedDB에 저장하므로 여기엔 사진을 저장하지 않습니다 —
-- 클라우드를 거치는 건 "LED 몇 번 켜라"는 아주 짧은 명령/확인 뿐입니다.

create table if not exists device_state (
  device_id text primary key,
  desired_channel integer not null default -1,   -- 앱이 요청한 채널 (-1=OFF, 0~2=LED)
  command_id bigint not null default 0,           -- 앱이 새 명령을 보낼 때마다 +1
  applied_id bigint not null default 0,           -- ESP32가 마지막으로 적용 완료한 command_id
  applied_channel integer not null default -1,    -- ESP32가 실제로 켠 채널
  applied_at timestamptz,                         -- ESP32가 마지막으로 ack한 시각
  device_seen_at timestamptz,                     -- ESP32가 마지막으로 폴링한 시각 (연결 상태 표시용)
  updated_at timestamptz not null default now()
);

-- 기본 장치 1개 등록 (device_id는 .env의 DEVICE_ID와 반드시 같아야 합니다)
insert into device_state (device_id)
values ('esp32-1')
on conflict (device_id) do nothing;

-- 서버 라우트는 SUPABASE_SERVICE_ROLE_KEY로만 접근합니다 (브라우저에 절대 노출 안 됨).
-- service role은 RLS를 우회하므로, 정책을 따로 만들지 않고 RLS만 켜서
-- 혹시 모를 anon key 노출 시에도 아무 것도 못 읽게 막아둡니다.
alter table device_state enable row level security;
