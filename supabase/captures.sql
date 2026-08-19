-- 촬영한 사진(배경+LED N장)을 Supabase Storage + captures 테이블에 자동 업로드하기 위한 스키마.
-- Supabase 프로젝트의 SQL Editor에서 이 파일 내용을 그대로 실행하세요.
-- (schema.sql, device_rpc.sql이 이미 실행되어 있다고 가정합니다.)

-- 1) 사진 저장용 Storage 버킷 (비공개 — 서버 라우트가 service role 키로만 읽고 씀)
insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

-- 2) 촬영본 메타데이터 테이블. 한 세션(배경 1장 + LED N장)마다 여러 행이 생긴다.
create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  label text not null default '',
  step_index integer not null,       -- 0=배경, 1..N=LED
  channel_name text,                 -- 'background' 또는 'Red'/'Green'/'Blue'
  r numeric not null,
  g numeric not null,
  b numeric not null,
  storage_path text not null,        -- storage.objects의 captures 버킷 안 경로
  created_at timestamptz not null default now()
);

-- 이미 integer로 만들어진 상태에서 재실행하는 경우를 위한 안전장치.
-- r/g/b는 픽셀 평균이라 소수점이 있는데, integer 컬럼이면 insert가 그대로 거부된다
-- (예: 123.456 -> "invalid input syntax for type integer" 에러) — numeric으로 바꿔둔다.
alter table captures alter column r type numeric using r::numeric;
alter table captures alter column g type numeric using g::numeric;
alter table captures alter column b type numeric using b::numeric;

create index if not exists captures_session_id_idx on captures (session_id);

-- 서버 라우트(SUPABASE_SERVICE_ROLE_KEY)만 이 테이블을 건드린다. RLS 켜두고
-- 정책은 안 만들어서, 혹시 모를 anon key 노출 시에도 아무것도 못 하게 막는다.
alter table captures enable row level security;
