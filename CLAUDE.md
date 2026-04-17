# CLAUDE.md — piCare-back

> Claude Code가 이 저장소에서 작업할 때 참고하는 안내 문서입니다.

---

## 1. 프로젝트 개요

**piCare-back**은 케어 로봇 기기 위에서 동작하는 로컬 중계 서버로, 프론트 앱의 로그 데이터를 외부 DB API로 전달하고 하드웨어 상태를 주기적으로 수집한다.

| 항목 | 내용 |
|---|---|
| 런타임 / 플랫폼 | Node.js v20 (Linux / Raspberry Pi 계열 타겟) |
| 프레임워크 | Fastify 5 |
| 데이터베이스 | 없음 (외부 API로 중계만 수행) |
| 로컬 주소 | `http://localhost:4000` |
| API 문서 | `http://localhost:4000/docs` (Swagger UI) |

---

## 2. 연결된 레포

| 레포 | 경로 | 설명 |
|---|---|---|
| FE | `../piCare-front` | 케어 로봇 프론트 앱 (로그 전송 주체) |

**환경별 연결 URL:**

| 환경 | URL |
|---|---|
| 로컬 | `http://localhost:4000` |
| 외부 DB API | `IAPI_BASE_URL` 환경 변수로 지정 (예: `https://api-intgr.circul.us/`) |

---

## 3. 기술 스택

| 레이어 | 기술 |
|---|---|
| 웹 프레임워크 | Fastify 5 |
| HTTP 클라이언트 | Axios |
| 스케줄러 | node-cron |
| API 문서화 | @fastify/swagger, @fastify/swagger-ui |
| 시스템 제어 | `child_process` (bash 명령어 실행), `pactl` (볼륨 제어) |
| 언어 | JavaScript ESM (`"type": "module"`) |

---

## 4. 명령어

```bash
# 개발 서버 (nodemon, 포트 4000)
npm run dev

# 프로덕션 서버
# 주의: package.json의 "start"는 존재하지 않는 src/server.js를 참조함 → npm run dev 사용 권장
npm start  # 현재 오류 발생
```

---

## 5. 아키텍처

### 엔트리포인트 흐름

```
index.js
  └─ Fastify 인스턴스 생성 (logger: false, 커스텀 로거 사용)
  └─ onRequest / onResponse 훅 (요청/응답 로깅)
  └─ CORS 등록 (@fastify/cors)
  └─ Swagger 등록 (@fastify/swagger, @fastify/swagger-ui → /docs)
  └─ 라우트 등록 (POST /v1/feature_log, /v1/interaction_log, /v1/cli_manager, /v1/system_volume)
  └─ Cron 플러그인 등록 (src/plugins/cron.js, 매 정시)
  └─ 서버 시작 (port: 4000, host: 0.0.0.0)
  └─ retryFetchHwId() 백그라운드 실행
       └─ hwId 로드 성공 시 → registerHardware() (DB에 기기 등록)
```

### 주요 모듈 / 서비스

| 파일·디렉토리 | 역할 |
|---|---|
| `index.js` | 서버 진입점, 모든 라우트 정의. 라우트 핸들러에서 `hwId`를 payload에 주입 |
| `src/api/index.js` | 외부 DB API 호출: `fetchHwId` (CPU 서비스에서 uuid 조회), `registerHardware` (기기 등록), `postHardwareLog` (로그 중계) |
| `src/utils/logger.js` | ANSI 컬러 + 타임스탬프 커스텀 로거 (`log.info`, `log.ok`, `log.warn`, `log.error`, `log.req`, `log.res`, `log.cron`) |
| `src/assets/command.js` | 하드웨어 수집용 bash 명령어 상수 (macOS/Linux 분기) |
| `src/plugins/cron.js` | Cron 스케줄 플러그인 — status/activity를 매 정시 수집 |
| `src/utils/index.js` | bash 명령어 실행 유틸 (`runCommand`) |
| `src/utils/dataFilter.js` | bash 출력 파싱 함수 (`parseSystemData`, `parseDeviceData`, `parseNetworkData`, `parsePowerData`) |

### 디렉토리 구조

```
piCare-back/
├── index.js              # 서버 진입점, 라우트 정의
├── src/
│   ├── api/
│   │   └── index.js      # 외부 API 호출 함수 (fetchHwId, registerHardware, postHardwareLog)
│   ├── assets/
│   │   └── command.js    # bash 명령어 상수
│   ├── plugins/
│   │   └── cron.js       # Cron 스케줄 플러그인
│   └── utils/
│       ├── index.js      # runCommand 유틸
│       ├── dataFilter.js # bash 출력 파싱
│       └── logger.js     # 커스텀 컬러 로거
├── .env                  # 환경 변수 (IAPI_BASE_URL, CPU_BASE_URL)
└── package.json
```

---

## 6. 인증

- **방식**: 없음 (현재 미구현)
- **외부 API 호출**: `src/api/index.js`에서 인증 헤더 없이 axios로 호출 중
- **현재 상태**: 운영 환경의 인증 방식(API Key / Bearer Token 등) 미적용 상태 — 추후 도입 필요

---

## 7. 에러 응답 포맷

**성공**
```json
{ "success": true }
```

**실패**
```json
{ "success": false, "error": "Relay Failed" }
```

`/v1/cli_manager`, `/v1/system_volume`의 실패 응답:
```json
{ "success": false, "data": { "message": "에러 메시지" } }
```

---

## 8. API 엔드포인트 목록

### 로그 중계

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/v1/feature_log` | ❌ | 학습 기능 로그 수신 → 외부 API 중계 |
| `POST` | `/v1/interaction_log` | ❌ | 상호작용 로그 수신 → 외부 API 중계 |

### 하드웨어 수집

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/v1/cli_manager` | ❌ | bash로 하드웨어 정보 수집 후 외부 API 전송 (`type`: `"status"` / `"activity"`) |

### 시스템 제어

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/v1/system_volume` | ❌ | `pactl`로 시스템 볼륨 설정 (`level`: 0~100) |

---

## 9. 주요 제약 / 주의사항

- **`hwId` 로드 방식**: 서버 시작 후 `retryFetchHwId()`가 백그라운드에서 5초마다 CPU 서비스(`CPU_BASE_URL`, `GET /`)를 재시도. 성공 시 `registerHardware()`로 DB에 기기를 등록하고, 이후 모든 로그 relay 시 payload에 `hwId`를 주입함. front에서 hwId를 전달하지 않아도 됨.
- **hwId가 null인 상태에서의 로그**: hwId 로드 전 수신된 로그는 `hwId: null`로 외부 DB에 전송됨. CPU 서비스가 준비되면 자동으로 로드되므로 부팅 직후 일시적으로 발생.
- **`start` 스크립트 오류**: `package.json`의 `"start": "node src/server.js"`는 존재하지 않는 파일 참조 → 개발 실행은 반드시 `npm run dev` 사용
- **`NETWOK_INFO` 오타**: `command.js`, `dataFilter.js`에서 `NETWORK_INFO` 대신 `NETWOK_INFO`로 사용 중. 수정 시 두 파일 동시에 변경해야 함
- **Cron 실패 시 재시도 없음**: 외부 API 전송 실패 시 단순 에러 로그만 출력하고 재시도하지 않음
- **타겟 OS**: 실제 배포 대상은 Linux (Raspberry Pi 계열). `command.js`에 macOS 분기 포함되어 있으나 운영 환경은 Linux임

---

## 10. 운영 시 주의사항

- `.env` 파일에 `IAPI_BASE_URL`과 `CPU_BASE_URL`이 반드시 설정되어 있어야 함. `CPU_BASE_URL`은 CPU 서비스 주소 (기본값: `http://127.0.0.1:59530`)
- 서버는 `0.0.0.0:4000`으로 바인딩되어 외부 네트워크에서 접근 가능. 방화벽 설정 시 주의
- `pactl` 명령어는 Linux PulseAudio 환경에서만 동작. macOS에서는 `/v1/system_volume` 호출 시 에러 발생
- Cron 스케줄 변경은 `index.js` 하단의 `fastify.register(cronPlugin, ...)` 인자를 수정
- 볼륨 API(`/v1/system_volume`)는 `child_process.execSync`를 사용하므로 블로킹 호출임에 주의
