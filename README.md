# piCare Back

> 케어 로봇 기기에서 실행되는 로컬 중계 서버 — 프론트 앱의 로그를 외부 DB API로 전달하고, 하드웨어 상태를 주기적으로 수집합니다. 오프라인 환경을 대비해 **로컬 MongoDB에 먼저 저장한 뒤 백그라운드로 동기화**합니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [로컬 개발환경 세팅](#3-로컬-개발환경-세팅)
4. [주요 기능 및 코드 설명](#4-주요-기능-및-코드-설명)
5. [API 명세](#5-api-명세)
6. [데이터베이스 구조](#6-데이터베이스-구조)
7. [환경변수](#7-환경변수)
8. [빌드 및 배포](#8-빌드-및-배포)
9. [트러블슈팅](#9-트러블슈팅)

---

## 1. 프로젝트 개요

`piCare Back`은 케어 로봇 기기 위에서 포트 **4000**으로 실행되는 경량 Node.js 서버입니다. 프론트(piCare Front)와 외부 통합 API(circul.us) 사이의 **중계자(Relay)** 역할을 하며, 인터넷이 불안정하거나 끊긴 환경에서도 로그가 유실되지 않도록 로컬 MongoDB를 큐로 사용합니다.

**핵심 역할**

- **로그 중계:** 프론트가 보낸 학습 로그(`feature_log`)·상호작용 로그(`interaction_log`)를 로컬 DB에 저장 후 외부 API로 전달
- **오프라인 대응 동기화:** 모든 로그를 먼저 `pending`으로 저장 → 즉시 응답 → 백그라운드로 외부 전송, 실패분은 Cron이 재시도
- **기기 자동 등록:** 서버 기동 시 CPU 서비스에서 기기 고유 `hwId`(uuid)를 조회해 외부 DB에 기기를 등록(upsert)
- **하드웨어 모니터링:** bash 명령어로 CPU·메모리·디스크·네트워크 등 상태를 매 정시 자동 수집·전송하고, 임계치 초과 시 알림 로그 발송
- **시스템 볼륨 제어:** `pactl`로 기기 시스템 볼륨을 API로 조절

**연결된 레포**

| 레포          | 경로                                                        | 설명                                 |
| ------------- | ----------------------------------------------------------- | ------------------------------------ |
| 프론트        | `../piCare-front`                                           | 케어 로봇 프론트 앱 (로그 전송 주체) |
| 외부 통합 API | `IAPI_BASE_URL`로 지정 (예: `https://api-intgr.circul.us/`) | 로그 최종 저장소 (circulus-iapi)     |

---

## 2. 기술 스택

| 분류            | 기술                                  | 버전                | 용도                         |
| --------------- | ------------------------------------- | ------------------- | ---------------------------- |
| 런타임          | Node.js                               | v20.19.3 (`.nvmrc`) | 서버 실행 환경               |
| 프레임워크      | Fastify                               | ^5.7.2              | HTTP 서버 및 라우팅          |
| 데이터베이스    | MongoDB                               | —                   | 로컬 로그 큐 (오프라인 대응) |
| ODM             | mongoose                              | ^9.5.0              | MongoDB 스키마/쿼리          |
| HTTP 클라이언트 | axios                                 | ^1.13.4             | 외부 API 호출                |
| 스케줄러        | node-cron                             | ^4.2.1              | 정기 수집 / 동기화 재시도    |
| CORS            | @fastify/cors                         | ^11.2.0             | 교차 출처 허용               |
| API 문서화      | @fastify/swagger, @fastify/swagger-ui | ^9.6.1 / ^5.2.5     | OpenAPI 문서(`/docs`)        |
| 환경변수        | dotenv                                | ^17.2.3             | `.env` 로드                  |
| 개발 도구       | nodemon                               | ^3.1.11             | 핫리로드(dev)                |
| 언어            | JavaScript ESM                        | —                   | `"type": "module"`           |

> 인증은 미구현 상태입니다. 외부 API 호출 시 인증 헤더 없이 axios로 전송합니다.

---

## 3. 로컬 개발환경 세팅

### 요구사항

- Node.js: `v20.19.3` (`.nvmrc` 기준)
- MongoDB: **로컬 설치** (`mongodb://localhost:27017/picare`) — 인증 없음

### 설치 및 실행

```bash
# 1. Node 버전 맞추기
nvm use

# 2. 의존성 설치
npm install

# 3. .env 작성 (7번 참고) — IAPI_BASE_URL, CPU_BASE_URL 필요

# 4. 개발 서버 실행 (포트 4000)
npm run dev
```

> 서버: `http://localhost:4000` · Swagger UI: `http://localhost:4000/docs`

### DB 연결이 일어나는 위치

- 서버 시작 시 `index.js`의 `start()`가 가장 먼저 `connectDB()`(`src/db/index.js`)를 호출합니다.
- 연결 URI는 `process.env.MONGO_URI`가 없으면 `mongodb://localhost:27017/picare`를 기본값으로 사용합니다.
- **연결 실패해도 서버는 계속 뜹니다.** 이 경우 로그는 DB 큐를 건너뛰고 외부 API로 직접 중계(폴백)됩니다. (`saveAndRelay`의 catch 분기)

### `dev` / `start` 차이

| 스크립트      | 명령                 | 비고                                             |
| ------------- | -------------------- | ------------------------------------------------ |
| `npm run dev` | `node index.js`      | 개발 실행 (현재 운영도 이걸로 구동)              |
| `npm start`   | `node src/server.js` | ⚠️ **존재하지 않는 파일 참조 → 오류**. 사용 금지 |

> `dev` 스크립트는 `node index.js`라 핫리로드가 동작하지 않습니다. nodemon은 `devDependencies`에 있으나 스크립트에 연결되어 있지 않으므로, 핫리로드가 필요하면 `npx nodemon index.js`로 실행하세요.

---

## 4. 주요 기능 및 코드 설명

> 이 서버의 핵심은 **"받은 즉시 로컬 저장 → 응답 → 백그라운드 동기화"** 흐름입니다.
> 라우트는 모두 `index.js` 한 파일에 정의되어 있고, 실제 저장/전송 로직은 `src/utils/syncLog.js`와 `src/api/index.js`로 분리되어 있습니다.

### 4-1. 로그 수신 및 동기화 (가장 핵심)

**관련 파일**

- `index.js` — 라우트 정의, 핸들러에서 `hwId`를 payload에 주입
- `src/utils/syncLog.js` — `saveAndRelay`(저장+백그라운드 전송), `flushPending`(재시도)
- `src/models/log.js` — 로컬 큐 `Log` 스키마
- `src/api/index.js` — 외부 API 호출 (`postHardwareLog`)

**요청 흐름 (예: `POST /v1/feature_log`)**

```
프론트 요청 (POST /v1/feature_log)
  → index.js 핸들러: payload = { ...request.body, hwId }
  → saveAndRelay("feature_log", payload)
       → Log.create({ ..., syncStatus: "pending" })   // 로컬 DB 저장
       → 즉시 { success: true } 반환                    // 응답은 여기서 끝
       → (백그라운드) postHardwareLog → 성공 시 syncStatus: "synced"
```

**핵심 코드**

```js
// src/utils/syncLog.js
export const saveAndRelay = async (endpoint, payload) => {
  try {
    const doc = await Log.create({
      endpoint,
      hwId: payload.hwId ?? null,
      payload,
    });
    // 응답을 막지 않도록 await 하지 않고 백그라운드로 전송
    postHardwareLog(endpoint, {
      ...payload,
      recordedAt: doc.createdAt.toISOString(),
    })
      .then(() => Log.findByIdAndUpdate(doc._id, { syncStatus: "synced" }))
      .catch(() => {}); // 실패해도 조용히 — pending 유지, Cron이 재시도
  } catch {
    // DB가 없으면 직접 relay로 폴백
    await postHardwareLog(endpoint, payload);
  }
};
```

> 💡 **왜 이렇게 했는가:** 사용자 응답 속도를 외부 네트워크가 아니라 **로컬 DB write 속도**로 고정하기 위해서입니다. 외부 전송은 실패해도 사용자에게는 항상 `{ success: true }`를 반환하고, 실패분은 `pending` 상태로 남아 5분마다 도는 `flushPending` Cron이 재처리합니다. `recordedAt`은 실제 발생 시각(`createdAt`)을 외부에 함께 보내, 동기화가 지연돼도 원래 시점을 잃지 않게 합니다.

### 4-2. pending 로그 재시도 (`flushPending`)

```js
// src/utils/syncLog.js
const MAX_RETRY = 5;
export const flushPending = async () => {
  const docs = await Log.find({
    syncStatus: "pending",
    retryCount: { $lt: MAX_RETRY },
  });
  for (const doc of docs) {
    try {
      await postHardwareLog(doc.endpoint, {
        ...doc.payload,
        recordedAt: doc.createdAt.toISOString(),
      });
      await Log.findByIdAndUpdate(doc._id, { syncStatus: "synced" });
    } catch {
      const next = doc.retryCount + 1;
      // MAX_RETRY 초과 시 failed 처리 + 알림 (무한 재시도 방지)
      await Log.findByIdAndUpdate(doc._id, {
        retryCount: next,
        ...(next >= MAX_RETRY ? { syncStatus: "failed" } : {}),
      });
    }
  }
};
```

> 💡 `retryCount`가 `MAX_RETRY`(5) 이상이면 `failed`로 바꿔 더 이상 시도하지 않습니다. 영구히 실패하는 로그가 큐에 쌓여 매번 재시도되는 것을 막기 위한 상한선입니다.

### 4-3. 기기 등록 (`hwId` 로드)

**관련 파일**: `index.js`의 `retryFetchHwId()`, `src/api/index.js`의 `fetchHwId`/`registerHardware`, `src/utils/alertLog.js`의 `setHwId`

```
서버 start() 완료 후 → retryFetchHwId() 백그라운드 실행
  → fetchHwId(): CPU 서비스(CPU_BASE_URL, GET /)에서 uuid 조회
  → 실패 시 5초 후 재시도 (성공할 때까지 반복)
  → 성공 시: setHwId(hwId) → registerHardware(hwId) (외부 DB upsert)
```

> 💡 `hwId`는 프론트가 보내지 않습니다. back이 CPU 서비스에서 직접 받아 모든 로그 payload에 주입합니다. **부팅 직후 CPU 서비스가 아직 준비되지 않았다면 그동안 들어온 로그는 `hwId: null`로 저장·전송**되며, 로드가 완료되면 이후 로그부터 정상 주입됩니다. `registerHardware`는 인터넷 연결 확인 역할도 겸합니다.

### 4-4. 하드웨어 상태 수집 (`/v1/cli_manager`)

**관련 파일**: `index.js`(라우트), `src/utils/dataFilter.js`(파싱), `src/utils/index.js`(`runCommand`), `src/assets/command.js`(bash 명령어), `src/plugins/cron.js`(스케줄)

```
Cron(매 정시) → fastify.inject(POST /v1/cli_manager, { type: "status" })
  → parseSystemData / parseDeviceData / parseNetworkData / parseUptimeData
       (각각 src/assets/command.js의 bash 명령어를 runCommand로 실행 후 파싱)
  → snapshot 객체 1개로 조립
  → saveAndRelay("status_log", { hwId, snapshot })
  → Cron 후처리: temp≥80 / cpu·mem·disk≥90 이면 postAlertLog 발송
```

> 💡 현재 `cli_manager`는 `type: "status"`만 처리합니다. 그 외 값은 `default` 분기에서 `throw new Error("No case")`로 처리됩니다(과거의 `activity` 케이스는 제거됨). 하드웨어 수집 명령어는 macOS/Linux 분기를 모두 포함하지만 **실제 배포 대상은 Linux(ARM 임베디드)** 입니다.

---

## 5. API 명세

> 모든 라우트는 `index.js`에 정의되어 있으며 **인증이 없습니다.**

| 메서드 | 경로                  | 설명                                                                     | 인증 |
| ------ | --------------------- | ------------------------------------------------------------------------ | ---- |
| POST   | `/v1/feature_log`     | 학습 기능 로그 수신 → 큐 저장 후 중계                                    | ❌   |
| POST   | `/v1/interaction_log` | 상호작용 로그 수신 → 큐 저장 후 중계                                     | ❌   |
| POST   | `/v1/cli_manager`     | 하드웨어 상태 수집 → `status_log`로 중계 (`type: "status"`만 지원)       | ❌   |
| POST   | `/v1/client_log`      | 프론트 디버그 로그 수신 (**서버 콘솔에만 출력, 외부 전송·DB 저장 없음**) | ❌   |
| POST   | `/v1/system_volume`   | `pactl`로 시스템 볼륨 설정                                               | ❌   |
| GET    | `/docs`               | Swagger UI                                                               | ❌   |

### 요청/응답 예시

**POST `/v1/feature_log`**

| 필드        | 타입   | 필수 | 설명                                 |
| ----------- | ------ | ---- | ------------------------------------ |
| `featureId` | string | ✅   | 실행된 기능 ID (예: `exercise_flag`) |
| `command`   | string |      | `start` / `complete`                 |
| `duration`  | number |      | 사용 시간(초)                        |

```json
// Request
{ "featureId": "exercise_flag", "command": "complete", "duration": 180 }

// Response 200
{ "success": true }

// Response 500
{ "success": false, "error": "Relay Failed" }
```

**POST `/v1/interaction_log`**

| 필드      | 타입   | 필수 | 설명                                                    |
| --------- | ------ | ---- | ------------------------------------------------------- |
| `type`    | string | ✅   | 상호작용 종류 (`flag`, `color`, `heartbeat`, `main` 등) |
| `content` | object |      | 상호작용 상세 내용                                      |

```json
// Request
{ "type": "flag", "content": { "scores": { "total": 80 } } }

// Response 200
{ "success": true }
```

**POST `/v1/cli_manager`**

| 필드   | 타입   | 필수 | 설명                                    |
| ------ | ------ | ---- | --------------------------------------- |
| `type` | string | ✅   | `"status"`만 지원 (그 외 값은 500 에러) |

```json
// Request
{ "type": "status" }

// Response 200 — data에 전송한 snapshot 포함
{ "success": true, "data": { "hwId": "...", "snapshot": { "cpu": "12.3%", ... } } }

// Response 500
{ "success": false, "data": { "message": "No case" } }
```

**POST `/v1/system_volume`**

| 필드    | 타입   | 필수 | 설명              |
| ------- | ------ | ---- | ----------------- |
| `level` | number | ✅   | 볼륨 레벨 0 ~ 100 |

```json
// Request
{ "level": 60 }

// Response 200
{ "success": true, "data": { "currentVolume": 60 } }

// Response 500
{ "success": false, "data": { "message": "볼륨 조절에 실패했습니다.", "error": "..." } }
```

> ⚠️ `system_volume`은 `child_process.execSync`(블로킹 호출)로 `pactl`을 실행합니다. Linux PulseAudio 환경에서만 동작하며 macOS에서는 에러가 납니다.

---

## 6. 데이터베이스 구조

로컬 MongoDB(`picare` DB)는 **외부 전송 전 임시 큐** 역할만 합니다. 외부 IAPI의 실제 스키마와는 별개이며, `payload`를 통째로 보관하는 구조입니다.

### `logs` 컬렉션 (`src/models/log.js`)

```js
{
  _id: ObjectId,                                  // 자동 생성
  endpoint: String,        // required           // "feature_log" | "interaction_log" | "status_log"
  hwId: String,            // default: null       // 기기 고유 ID (payload에서 분리 저장)
  payload: Mixed,          // required            // 외부로 보낼 본문 전체 (endpoint별 구조 다름)
  syncStatus: String,      // enum, default 'pending'  // 'pending' | 'synced' | 'failed'
  retryCount: Number,      // default: 0          // flushPending 재시도 횟수 (상한 5)
  createdAt: Date,         // timestamps 자동      // 실제 로그 발생 시각 (recordedAt으로 전송)
  updatedAt: Date,
}
```

### `endpoint`별 `payload` 구조 (외부 IAPI로 전송되는 본문)

| endpoint          | payload 필드                               |
| ----------------- | ------------------------------------------ |
| `feature_log`     | `hwId`, `featureId`, `command`, `duration` |
| `interaction_log` | `hwId`, `type`, `content`                  |
| `status_log`      | `hwId`, `snapshot`(아래 참고)              |

**`status_log`의 `snapshot` 필드**

```
geo, power, temp, cpu, mem, disk,
usbCnt, usbDur, trafficAmount,
ping, down, up, ip, isp, country, lat, lon,
ssid, freq, signal, ap_count,
bootedAt, uptimeSec
```

> 💡 `src/models/log.js` 상단 주석의 `status_log: { hwId, status, network, location }`는 **구버전 설명으로 현재 코드와 다릅니다.** 실제로는 위처럼 `snapshot` 객체 하나로 전송됩니다(`index.js`의 `cli_manager` 핸들러 기준). 외부 IAPI에서는 `{ hwId, date }` 기준 하루 1도큐먼트에 `snapshots[]`로 누적됩니다.

> `MongoDB는 인증이 없습니다`(`Access control is not enabled`). 향후 인증 추가 시 `.env`에 `MONGO_URI=mongodb://user:pass@localhost:27017/picare` 형식으로 지정합니다.

---

## 7. 환경변수

`.env` 파일에 설정합니다. (실제 값은 보안상 기재하지 않음)

```env
IAPI_BASE_URL=     # 외부 통합 DB API 주소 (예: https://api-intgr.circul.us/)
CPU_BASE_URL=      # CPU 서비스 주소 — hwId 조회용 (예: http://127.0.0.1:59530)
# MONGO_URI=       # (선택) 미설정 시 mongodb://localhost:27017/picare 기본값 사용
```

| 변수명          | 필수 | 설명                                                        |
| --------------- | ---- | ----------------------------------------------------------- |
| `IAPI_BASE_URL` | ✅   | 로그 최종 전송 대상 외부 API                                |
| `CPU_BASE_URL`  | ✅   | 기기 `hwId`(uuid) 조회용 CPU 서비스 주소                    |
| `MONGO_URI`     |      | 로컬 큐 MongoDB 주소. 코드에 기본값 있음(`src/db/index.js`) |

---

## 8. 빌드 및 배포

```bash
npm run dev    # 운영/개발 모두 이 명령으로 구동 (node index.js)
# npm start    # ⚠️ 사용 금지 — 존재하지 않는 src/server.js 참조
```

- **배포 대상:** Linux (ARM 계열 임베디드 기기). bash 명령어와 `pactl`이 Linux 기준이라 macOS에서는 일부 기능이 동작하지 않습니다.
- **바인딩:** `0.0.0.0:4000` — 같은 네트워크의 외부에서 접근 가능하므로 방화벽 설정에 주의하세요.
- **프로세스 관리:** 운영 기기에서는 PM2로 구동합니다 (`PICARE-LOG` 프로세스). _(배포 자동화 방식·CI 등 상세는 팀 운영 문서 확인 필요)_
- **선행 서비스:** 기동 시 MongoDB와 CPU 서비스가 떠 있어야 정상 동작합니다. (없어도 서버는 뜨지만 각각 직접 relay 폴백 / `hwId: null` 상태가 됨)

### Cron 스케줄 (`src/plugins/cron.js`)

| 스케줄                  | 동작                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `0 * * * *` (매 정시)   | `cli_manager(type: status)` 호출 → 하드웨어 snapshot 수집·전송, 임계치 초과 시 알림 |
| `*/5 * * * *` (5분마다) | `flushPending()` — `pending` 로그 재전송                                            |

스케줄 변경은 `index.js` 하단 `fastify.register(cronPlugin, "0 * * * *")` 인자를 수정합니다.

---

## 9. 트러블슈팅

### Q. `npm start`를 했더니 모듈을 못 찾는다는 오류가 나요.

`package.json`의 `start` 스크립트가 존재하지 않는 `src/server.js`를 참조합니다. 실행은 반드시 `npm run dev`(= `node index.js`)를 사용하세요. (수정하려면 `start`를 `node index.js`로 바꾸면 됩니다.)

### Q. MongoDB 연결이 안 돼요.

1. 로컬 MongoDB 실행 여부 확인 (기본 `mongodb://localhost:27017/picare`, 인증 없음)
2. `.env`의 `MONGO_URI`를 별도 지정했다면 주소 확인
3. 연결이 실패해도 서버는 뜨며 로그가 외부로 직접 중계(폴백)됩니다. 콘솔에 `MongoDB FAILED:` 로그가 보이는지 확인하세요.

### Q. 로그가 외부 DB에 들어가지 않아요.

1. 외부 API 자체가 막힌 경우: 로컬 DB에는 `syncStatus: pending`으로 남아 있고, 5분마다 `flushPending`이 재시도합니다. `logs` 컬렉션에서 `syncStatus`를 확인하세요.
2. `retryCount`가 5에 도달하면 `failed`로 바뀌어 더 이상 재시도하지 않습니다. (원인 해결 후 수동으로 상태를 `pending`으로 되돌려야 재전송됩니다.)
3. `IAPI_BASE_URL`이 `.env`에 올바로 설정됐는지 확인하세요.

### Q. 로그가 `hwId: null`로 들어가요.

부팅 직후 CPU 서비스가 아직 준비되지 않은 동안 들어온 로그입니다. `retryFetchHwId`가 5초마다 재시도해 로드되면 이후 로그부터 정상 주입됩니다. 콘솔에서 `hwId loaded:` 메시지를 확인하세요. 계속 실패한다면 `CPU_BASE_URL`과 CPU 서비스 상태를 점검합니다.

### 참고: 코드에 남아 있는 알려진 이슈

- **`NETWOK_INFO` 오타:** `src/assets/command.js`·`src/utils/dataFilter.js`에서 `NETWORK_INFO`가 아닌 `NETWOK_INFO`로 쓰입니다. 수정 시 두 파일을 동시에 바꿔야 합니다.
- **외부 API 인증 없음:** `src/api/index.js`는 인증 헤더 없이 호출합니다. 운영 인증 방식 도입 시 추가 필요.
- **Cron status 수집 실패 시:** 단순 에러 로그 + 알림만 남기고 해당 정시 snapshot은 재시도하지 않습니다. (`flushPending`은 이미 DB에 저장된 로그만 대상)
