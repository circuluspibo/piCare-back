# piCare Back

> 케어 로봇 기기에서 실행되는 로컬 중계 서버 — 프론트 앱의 로그 데이터를 외부 DB API로 전달하고, 하드웨어 상태를 주기적으로 수집합니다.

---

## 목차

1. [프로젝트 소개](#1-프로젝트-소개)
2. [주요 기능](#2-주요-기능)
3. [기술 스택](#3-기술-스택)
4. [프로젝트 구조](#4-프로젝트-구조)
5. [환경 변수](#5-환경-변수)
6. [시작하기](#6-시작하기)
7. [API 엔드포인트 명세](#7-api-엔드포인트-명세)
8. [Cron 스케줄](#8-cron-스케줄)
9. [하드웨어 수집 항목](#9-하드웨어-수집-항목)
10. [알려진 이슈 & 개선사항](#10-알려진-이슈--개선사항)

---

## 1. 프로젝트 소개

`piCare Back`은 케어 로봇 기기 위에서 포트 **4000**으로 실행되는 경량 Node.js 서버입니다. 프론트(piCare Front)와 외부 통합 API(circul.us) 사이의 중계 역할을 담당하며, bash 명령어로 기기의 하드웨어 상태를 수집해 정기적으로 외부 서버에 전송합니다.

- **패키지명:** `picare-backend`
- **실행 포트:** `4000`
- **Swagger UI:** `http://localhost:4000/docs`

---

## 2. 주요 기능

- **로그 중계:** 프론트에서 수신한 학습 기능 로그와 상호작용 로그를 외부 DB API로 전달 (Relay 패턴). `hwId`는 back에서 자동 주입하므로 front에서 전달 불필요
- **기기 등록:** 서버 시작 시 CPU 서비스에서 `hwId`(uuid)를 조회한 뒤 외부 DB에 기기를 자동 등록(upsert). 인터넷 연결 확인 역할도 겸함
- **하드웨어 모니터링:** bash 명령어로 CPU·메모리·디스크·네트워크·USB·전원 이력 수집 후 외부 API 전송
- **시스템 볼륨 제어:** `pactl` 명령어로 기기 시스템 볼륨을 API로 조절
- **자동 수집 스케줄:** Cron으로 매 정시 하드웨어 상태와 전원 활동을 자동 수집
- **API 문서 자동화:** Fastify Swagger로 OpenAPI 문서를 `/docs` 경로에서 제공

---

## 3. 기술 스택

| 분류            | 기술                                  |
| --------------- | ------------------------------------- |
| 런타임          | Node.js v20.19.3                      |
| 프레임워크      | Fastify 5                             |
| HTTP 클라이언트 | Axios                                 |
| 스케줄러        | node-cron                             |
| API 문서화      | @fastify/swagger, @fastify/swagger-ui |
| 언어            | JavaScript ESM                        |

---

## 4. 프로젝트 구조

```
piCare-back/
├── index.js                  # 서버 진입점, 라우트 정의
├── src/
│   ├── api/
│   │   └── index.js          # 외부 API 호출 (fetchHwId, registerHardware, postHardwareLog)
│   ├── assets/
│   │   └── command.js        # 하드웨어 수집용 bash 명령어 상수
│   ├── plugins/
│   │   └── cron.js           # Cron 스케줄 플러그인 (status / activity)
│   └── utils/
│       ├── index.js          # bash 명령어 실행 유틸 (runCommand)
│       ├── dataFilter.js     # bash 출력 파싱 함수 모음
│       └── logger.js         # ANSI 컬러 커스텀 로거
├── .env                      # 환경 변수
├── .nvmrc                    # Node.js 버전 명세
└── package.json
```

---

## 5. 환경 변수

`.env` 파일에 아래 항목을 설정합니다.

| 변수명          | 설명                          | 예시                           |
| --------------- | ----------------------------- | ------------------------------ |
| `IAPI_BASE_URL` | 외부 통합 DB API 주소         | `https://api-intgr.circul.us/` |
| `CPU_BASE_URL`  | CPU 서비스 주소 (hwId 조회용) | `http://127.0.0.1:59530`       |

---

## 6. 시작하기

**Node.js 버전:** `v20.19.3` (`.nvmrc` 참고)

```bash
# 1. Node 버전 맞추기
nvm use

# 2. 의존성 설치
npm install

# 3. 개발 서버 실행 (nodemon, 포트 4000)
npm run dev
```

> **주의:** `package.json`의 `start` 스크립트(`node src/server.js`)는 현재 존재하지 않는 파일을 참조합니다. 개발 실행 시 반드시 `npm run dev`를 사용하세요.

서버가 실행되면 아래 주소에서 Swagger API 문서를 확인할 수 있습니다.

```
http://localhost:4000/docs
```

---

## 7. API 엔드포인트 명세

### `POST /v1/feature_log`

사용자가 실행한 학습·훈련 기능 데이터를 수신해 외부 API로 중계합니다.

**Request Body**

| 필드        | 타입   | 필수 | 설명           |
| ----------- | ------ | ---- | -------------- |
| `featureId` | string | ✅   | 실행된 기능 ID |
| `command`   | string |      | 실행 명령      |
| `duration`  | number |      | 사용 시간 (초) |

---

### `POST /v1/interaction_log`

사용자의 상호작용 데이터를 수신해 외부 API로 중계합니다.

**Request Body**

| 필드      | 타입   | 필수 | 설명               |
| --------- | ------ | ---- | ------------------ |
| `type`    | string | ✅   | 상호작용 종류      |
| `content` | object |      | 상호작용 상세 내용 |

---

### `POST /v1/cli_manager`

bash 명령어로 하드웨어 정보를 수집하고 외부 API로 전송합니다. Cron에서도 내부적으로 호출합니다.

**Request Body**

| 필드   | 타입   | 필수 | 설명                         |
| ------ | ------ | ---- | ---------------------------- |
| `type` | string | ✅   | `"status"` 또는 `"activity"` |

- `status`: 시스템 정보 + 디바이스 정보 + 네트워크 정보를 수집해 `/v1/status_log`로 전송
- `activity`: 전원 동작 정보를 수집해 `/v1/activity_log`로 전송

---

### `POST /v1/system_volume`

`pactl` 명령어로 기기 시스템 볼륨을 설정합니다.

**Request Body**

| 필드    | 타입   | 필수 | 설명                |
| ------- | ------ | ---- | ------------------- |
| `level` | number | ✅   | 볼륨 레벨 (0 ~ 100) |

---

## 8. Cron 스케줄

Cron 플러그인은 서버 시작 시 자동으로 등록됩니다.

| 스케줄                | 동작                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| `0 * * * *` (매 정시) | `/v1/cli_manager` (type: `"status"`) 호출 → 하드웨어 상태 수집 및 전송 |
| `0 * * * *` (매 정시) | `/v1/cli_manager` (type: `"activity"`) 호출 → 전원 활동 수집 및 전송   |

스케줄 주기를 변경하려면 `index.js` 하단의 Cron 등록 부분을 수정합니다.

```javascript
// 현재 설정 (매 정시)
await fastify.register(cronPlugin, "0 * * * *");

// 테스트용 (매 1분)
// await fastify.register(cronPlugin, '*/1 * * * *');
```

---

## 9. 하드웨어 수집 항목

`/v1/cli_manager` 호출 시 bash 명령어로 아래 정보를 수집합니다. macOS와 Linux 분기 처리가 포함되어 있습니다.

### 시스템 정보 (`SYSTEM_INFO`)

| 항목    | 설명              |
| ------- | ----------------- |
| `geo`   | 시스템 타임존     |
| `power` | 배터리 잔량       |
| `temp`  | CPU 온도 (°C)     |
| `cpu`   | CPU 사용률 (%)    |
| `mem`   | 메모리 사용률 (%) |
| `disk`  | 디스크 사용률 (%) |

### 전원 정보 (`POWER_INFO`)

| 항목     | 설명                        |
| -------- | --------------------------- |
| `onCnt`  | 마지막 부팅 시각 (ISO 8601) |
| `onDur`  | 현재 가동 시간 (초)         |
| `offCnt` | 이전 종료 시각              |
| `offDur` | 이전 종료 후 경과 시간 (초) |

### 디바이스 정보 (`DEVICE_INFO`)

| 항목            | 설명                           |
| --------------- | ------------------------------ |
| `usbCnt`        | 연결된 USB 장치 수             |
| `usbDur`        | 마지막 USB 연결 경과 시간 (초) |
| `trafficAmount` | 네트워크 트래픽 사용량         |

### 네트워크 정보 (`NETWOK_INFO`)

| 항목          | 설명                          |
| ------------- | ----------------------------- |
| `ping`        | 외부 연결 여부 (8.8.8.8 ping) |
| `down` / `up` | 수신 / 송신 트래픽            |
| `ip`          | 로컬 IP 주소                  |
| `isp`         | ISP 정보                      |
| `country`     | 접속 국가                     |
| `geo`         | 위도/경도                     |
| `ssid`        | 연결된 Wi-Fi SSID             |
| `freq`        | Wi-Fi 채널/주파수             |
| `signal`      | Wi-Fi 신호 강도               |
| `ap_count`    | 주변 AP 수                    |

---

## 10. 알려진 이슈 & 개선사항

### 외부 API 인증 헤더 없음

`src/api/index.js`에서 `circul.us` API 호출 시 별도 인증 헤더가 설정되어 있지 않습니다. 운영 환경의 실제 인증 방식(API Key, Bearer Token 등)을 확인하고 적용해야 합니다.

### Cron 실패 시 재시도 로직 없음

`src/plugins/cron.js`에서 외부 API 전송 실패 시 단순 에러 로그만 출력하고 재시도하지 않습니다. 네트워크 단절 등의 상황에서 해당 시간의 하드웨어 데이터가 유실될 수 있습니다. 재시도 큐 또는 로컬 임시 저장 로직 도입을 검토해야 합니다.

### `start` 스크립트가 존재하지 않는 파일 참조

`package.json`의 `"start": "node src/server.js"` 스크립트가 실제로 존재하지 않는 `src/server.js`를 참조합니다. 프로덕션 배포 시 오류가 발생하므로, `index.js`를 참조하도록 수정하거나 `src/server.js` 파일을 생성해야 합니다.

### 타겟 OS 미명시

`command.js`의 bash 명령어들은 macOS/Linux 분기 처리를 포함하고 있으나, 실제 배포 대상 OS가 명시되어 있지 않습니다. 타겟 환경을 README 또는 환경 변수로 명시하고, 불필요한 분기를 제거해 명령어를 단순화하는 것이 유지보수에 유리합니다.

### `NETWOK_INFO` 오타

`src/assets/command.js` 및 `src/utils/dataFilter.js`에서 `NETWOK_INFO` (Network의 오타)가 그대로 사용되고 있습니다. 리팩터링 시 `NETWORK_INFO`로 통일해야 합니다.
