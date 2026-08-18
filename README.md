# ColorMatcher Web (Next.js)

Node.js(Next.js)로 만든 색상매칭 앱입니다. 카메라는 브라우저의 `getUserMedia`를
그대로 쓰고, LED 제어는 **클라우드 릴레이**를 거쳐 ESP32(LTE)에 전달됩니다 —
폰과 ESP32가 같은 Wi-Fi에 있을 필요가 없고, 앱도 Vercel 같은 클라우드에
정상적으로 배포할 수 있습니다.

## 왜 이런 구조인가 (중요 — 꼭 읽어주세요)

이전 버전은 "이 Next.js 서버가 폰·ESP32와 같은 Wi-Fi에서 돌아야 한다"는
제약이 있었습니다 (로컬 `npm run dev` 전제). 그런데 실제 목표는 이 앱을
다른 사람 폰으로도 보내서 쓸 수 있어야 하고, 사용자가 매번 특정 Wi-Fi에
수동으로 연결하게 만들고 싶지 않다는 것이었습니다. 마침 쓰고 있는 ESP32
보드(HiGenis HG-ESP32-S3-LTE)에 자체 유심(LTE) 모뎀이 있어서, 이 모뎀으로
ESP32가 스스로 인터넷에 붙게 하고, 폰 앱은 클라우드에 정상 배포하는 쪽으로
구조를 바꿨습니다.

**새 구조:**

```
폰 브라우저 ── (같은 오리진, HTTPS) ──> Next.js API (Vercel)
                                            │
                                            ▼
                                       Supabase (device_state 테이블)
                                            ▲
                                            │ (LTE, AT+QHTTPGET)
                                       ESP32 (주기적으로 폴링)
                                            │
                                            ▼
                                       LED 3개 (GPIO 14/13/12)
```

- 폰이 "LED N번 켜줘"라고 하면 `/api/device/command`가 Supabase에 "원하는
  채널"과 명령 번호(commandId)만 기록합니다.
- ESP32는 LTE로 `/api/device/poll`을 주기적으로 호출해서 새 명령이 있는지
  확인하고, 있으면 실제로 LED를 켠 뒤 `/api/device/ack`로 "적용했다"고
  알려줍니다.
- 폰은 `/api/device/status`를 폴링하며 "적용됐다"는 응답이 올 때까지
  기다렸다가 그제서야 카메라 프레임을 캡처합니다.
- **사진 자체는 클라우드를 거치지 않습니다** — 여전히 브라우저에서 로컬로
  찍어서 IndexedDB에 저장합니다. 클라우드를 거치는 건 "LED 몇 번 켜라"는
  아주 짧은 명령/확인뿐입니다.

**⚠ 알아둬야 할 트레이드오프: LTE 왕복이 느립니다.** 실측 결과 HTTP 요청
하나 왕복에 평균 5.8초, 최대 9.8초, 최소 1.8초가 걸렸습니다 (기지국 상태에
따라 편차가 큼). 그래서:
- 고정 딜레이가 아니라 **실제로 적용됐다는 응답을 받을 때까지 폴링**하는
  방식으로 짜여 있습니다 (`src/lib/ledClient.ts`의 `setChannelAndWait`).
- 촬영 한 세션(배경+LED 3장)이 대략 **40초~1분 30초**, 최악의 경우
  2~3분까지 걸릴 수 있습니다. Wi-Fi 버전처럼 즉각적이지 않습니다 — "누르고
  기다리는" 방식이라고 생각하시면 됩니다.

## 필요한 것

1. **Supabase 프로젝트** (무료 플랜으로 충분) — 명령 큐 하나만 저장하는
   테이블 하나만 씁니다.
2. **Vercel 계정** (또는 다른 Next.js 호스팅) — 이 앱을 배포합니다.
3. **ESP32(LTE) 펌웨어**에 배포 도메인/비밀값을 넣어서 재업로드.

## 설정 순서

### 1) Supabase 테이블 만들기

Supabase 프로젝트 → SQL Editor에서 `supabase/schema.sql` 내용을 그대로
실행하세요. `device_state`라는 테이블 하나가 생기고, 기본 행(`esp32-1`)이
하나 들어갑니다.

Project Settings → API 메뉴에서 **Project URL**과 **service_role 키**를
복사해둡니다 (anon 키 아님 — service_role 키는 절대 브라우저에 노출되면
안 되므로 서버 환경변수로만 씁니다).

### 2) 환경변수 설정

`.env.local.example`을 참고해서 로컬은 `.env.local`에, Vercel은
Project Settings → Environment Variables에 다음 4개를 등록합니다:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DEVICE_ID=esp32-1
DEVICE_SECRET=아무 긴 임의 문자열
```

### 3) 앱 배포 (Vercel)

```bash
cd color-matcher-web
npm install
```

Vercel에 이 폴더를 연결해서 배포하면(대시보드에서 Import, 또는
`vercel --prod`), `https://your-app.vercel.app` 같은 도메인이 생깁니다.
카메라(`getUserMedia`)는 HTTPS에서만 동작하는데, Vercel은 기본적으로
HTTPS를 제공하므로 이전 버전처럼 자체서명 인증서 경고를 처리할 필요가
없습니다.

로컬에서 미리 확인하고 싶으면 `npm run dev`로 실행하되, ESP32는 클라우드
(Supabase)를 통해서만 통신하므로 로컬 서버로도 정상 동작합니다 (단, 로컬
서버 자체를 폰에서 접속하려면 여전히 같은 네트워크이거나 터널링이
필요합니다 — 실사용은 Vercel 배포를 전제로 합니다).

### 4) ESP32 펌웨어에 값 채우기

`esp32_firmware/src/main.cpp` 상단의 3개 상수를 채웁니다:

```cpp
const char* SERVER_HOST = "your-app.vercel.app"; // https:// 뺀 도메인만
const char* DEVICE_SECRET = "위에서 정한 것과 동일한 값";
const char* APN = "lte.sktelecom.com"; // 유심 통신사에 맞게
```

PlatformIO Upload로 업로드하면, ESP32가 부팅 후 LTE에 붙어서 자동으로
`/api/device/poll`을 폴링하기 시작합니다. Serial Monitor에 `[POLL]`,
`[ACK]` 로그가 찍히면 정상 동작 중인 것입니다.

**⚠ 확인 필요:** `main.cpp`의 `powerOnModem()`에서 GPIO5로 모뎀 전원을
켜는 로직을 넣어뒀는데, 이건 원래 제가 드렸던 코드엔 없던 부분이라
직전 실측 테스트 때 직접 추가하신 것으로 보입니다. GPIO 번호/방식이
실제 보드와 맞는지 한 번 확인해주세요 — 안 맞으면 알려주시면 바로
고쳐드리겠습니다.

## 기능 범위

- ESP32(LTE) 클라우드 릴레이로 배경 1장 + LED 3장(Red/Green/Blue,
  GPIO 14/13/12) 순차 자동 촬영 — "적용 확인" 폴링 방식이라 단계마다
  몇 초~십수 초 대기 메시지가 뜹니다.
- 라벨을 붙여 저장 — 브라우저 **IndexedDB**에 RGB 값과 촬영된 사진
  원본(JPEG)을 함께 보관.
- 저장된 데이터셋을 CSV로 내보내기 (`dataset.csv`).
- 세션별로 촬영 사진 4장을 zip으로 다운로드.

다음 단계로 자연스럽게 이어질 수 있는 것들(이번 범위 밖):

- 기준 색상(reference color) 등록 + 유사도 판별 UI
- 여러 기기에서 데이터셋(사진 포함)을 공유하려면 IndexedDB 대신
  Supabase Storage로 사진까지 옮기기
- PWA(홈 화면에 추가) 지원
- ESP32가 여러 대일 경우 device_id별로 구분해서 다중 기기 지원

## 프로젝트 구조

```
supabase/
  schema.sql                # device_state 테이블 정의 (Supabase SQL Editor에서 실행)
src/
  app/
    page.tsx                 # 메인 화면 (연결 상태 + 카메라 + 촬영 + 저장 목록)
    layout.tsx
    api/device/
      command/route.ts        # 폰 → "이 채널 켜줘" 명령 기록
      status/route.ts          # 폰 → 적용 여부 폴링
      poll/route.ts             # ESP32(LTE) → 대기 중인 명령 조회
      ack/route.ts               # ESP32(LTE) → 적용 완료 확인
  components/
    ProgressDots.tsx
    GlassCard.tsx
    SessionList.tsx          # 저장된 데이터셋 목록(사진 썸네일) + CSV/zip 내보내기
  lib/
    types.ts
    useCaptureController.ts   # 촬영 상태 머신 (카메라/클라우드릴레이/저장)
    ledClient.ts              # /api/device/* 호출 헬퍼 (명령 보내고 적용될 때까지 폴링)
    supabaseAdmin.ts          # 서버 전용 Supabase 클라이언트 (service role)
    colorAnalysis.ts          # 중앙 ROI 평균 RGB 추출 + 전체 프레임 JPEG Blob
    db.ts                     # IndexedDB 저장/불러오기 (세션 + 사진)
    dataset.ts                # CSV 변환 + 세션별 사진 zip 다운로드
```

ESP32 펌웨어는 `../color_matcher/esp32_firmware/`에 있습니다. `main.cpp`가
현재 쓰는 LTE 클라우드 릴레이 버전이고, 예전 로컬 Wi-Fi 버전은
`main_wifi_backup.cpp`에 그대로 남겨뒀습니다 (LTE 쪽에 문제가 생기면
언제든 다시 꺼내 쓸 수 있습니다). GPIO 14/13/12에 각각 Red/Green/Blue
LED가 연결되어 있어야 합니다.
