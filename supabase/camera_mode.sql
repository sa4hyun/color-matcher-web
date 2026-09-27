-- 카메라 모듈 모드 + 포토다이오드 값을 분석 데이터(captures)에 같이 저장하기 위한 스키마 추가.
-- Supabase SQL Editor에서 실행 (여러 번 실행해도 안전).
--
-- 전제: color-matcher-web-camer/supabase/cam_schema.sql, cam_schema_v2.sql 이 이미 실행돼 있음
--   (cam_sessions / cam_shots 테이블, device_state.applied_pd_mv 칸)
--
-- 하는 일 (전부 "칸 추가"만 한다. 기존 데이터는 그대로):
--   captures.source         : 'phone'(폰 카메라) 또는 'camera'(카메라 모듈). 기존 행은 전부 'phone'
--   captures.pd_mv          : 그 사진을 찍을 때 포토다이오드 1초 평균 (mV). 기존 행은 비어 있음
--   captures.cam_session_id : 카메라 모듈로 찍은 경우 원본 cam_sessions.id

alter table captures add column if not exists source text not null default 'phone';
alter table captures add column if not exists pd_mv numeric;
alter table captures add column if not exists cam_session_id bigint;

create index if not exists captures_cam_session_id_idx on captures (cam_session_id);

-- 폰 모드에서 LTE 보드가 ack할 때 포토다이오드 값을 넣는 칸 (cam_schema_v2.sql에서 이미 추가됐으면 건너뜀)
alter table device_state add column if not exists applied_pd_mv numeric;

notify pgrst, 'reload schema';
