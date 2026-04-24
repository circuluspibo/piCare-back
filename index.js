// import { postStatusLog } from './src/api/index.js';
import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import cors from "@fastify/cors";
import {
  parseDeviceData,
  parseNetworkData,
  parsePowerData,
  parseSystemData,
} from "./src/utils/dataFilter.js";
import cronPlugin from "./src/plugins/cron.js";
import {
  fetchHwId,
  registerHardware,
} from "./src/api/index.js";
import { connectDB } from "./src/db/index.js";
import { saveAndRelay } from "./src/utils/syncLog.js";
import { execSync } from "child_process";
import { log } from "./src/utils/logger.js";

const fastify = Fastify({ logger: false });

fastify.addHook("onRequest", (request, reply, done) => {
  request.startTime = Date.now();
  log.req(request.method, request.url);
  done();
});

fastify.addHook("onResponse", (request, reply, done) => {
  const ms = Date.now() - request.startTime;
  log.res(request.method, request.url, reply.statusCode, ms);
  done();
});

let hwId = null;

await fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST"],
});
// Swagger 플러그인 등록
await fastify.register(fastifySwagger, {
  openapi: {
    info: {
      title: "piCare 데이터 수집 API",
      description: "piCare 분석 로그 중계 서버",
      version: "1.0.0",
    },
  },
});
await fastify.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});
// NOTE: API Route
// NOTE: 학습 데이터 수집
fastify.post(
  "/v1/feature_log",
  {
    schema: {
      description: "piCare 학습 종류 분석 데이터 수집 API",
      tags: ["학습 종류 수집"],
      body: {
        type: "object",
        required: ["featureId"],
        properties: {
          featureId: { type: "string" },
          command: { type: "string" },
          duration: { type: "number" },
        },
      },
      response: {
        200: { type: "object", properties: { success: { type: "boolean" } } },
      },
    },
  },
  async (request, reply) => {
    try {
      const payload = { ...request.body, hwId };
      log.ok(`feature_log hwId=${hwId} featureId=${payload.featureId}`);
      await saveAndRelay("feature_log", payload);
      return { success: true };
    } catch (error) {
      log.error(`feature_log FAILED: ${error.message}`);
      return reply.status(500).send({ success: false, error: "Relay Failed" });
    }
  },
);

// NOTE: 상호작용 데이터 수집
fastify.post(
  "/v1/interaction_log",
  {
    schema: {
      description: "piCare 상호작용 데이터 수집 API",
      tags: ["상호작용 데이터 수집"],
      body: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string" },
          content: { type: "object" },
        },
      },
      response: {
        200: { type: "object", properties: { success: { type: "boolean" } } },
      },
    },
  },
  async (request, reply) => {
    try {
      const payload = { ...request.body, hwId };
      await saveAndRelay("interaction_log", payload);
      return { success: true };
    } catch (error) {
      log.error(`interaction_log FAILED: ${error.message}`);
      return reply.status(500).send({ success: false, error: "Relay Failed" });
    }
  },
);
// Status, Activity API 수집
fastify.post(
  "/v1/cli_manager",
  {
    schema: {
      description: "Activity, Status 관련 하드웨어 데이터 수집",
      tags: ["하드웨어 데이터 수집"],
      body: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["success"], // success는 무조건 있어야 함
          properties: {
            success: { type: "boolean" },
            data: { type: "object", additionalProperties: true },
          },
        },
      },
    },
  },
  async (request, reply) => {
    try {
      const { type } = request.body;
      let result = {};
      switch (type) {
        case "status": {
          const system = await parseSystemData();
          const device = await parseDeviceData();
          const network = await parseNetworkData();
          result = {
            hwId,
            status: { ...system, ...device },
            network,
          };
          break;
        }
        case "activity": {
          const power = await parsePowerData();
          result = {
            hwId,
            activityType: "power",
            value: 1,
            meta: power,
          };
          break;
        }
        default: {
          throw new Error("No case");
        }
      }
      await saveAndRelay(`${type}_log`, result);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      log.error(`cli_manager FAILED: ${error.message}`);

      return reply.status(500).send({
        success: false,
        data: { message: error.message },
      });
    }
  },
);

fastify.post(
  "/v1/system_volume",
  {
    schema: {
      description: "시스템 볼륨 조절 API (pactl 사용)",
      tags: ["시스템 제어"],
      body: {
        type: "object",
        required: ["level"],
        properties: {
          level: { type: "number", minimum: 0, maximum: 100 },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: {
              type: "object",
              properties: {
                currentVolume: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
  async (request, reply) => {
    try {
      const { level } = request.body;
      // pactl 명령어로 볼륨 설정
      // @DEFAULT_SINK@는 현재 활성화된 기본 스피커를 의미합니다.
      execSync(`pactl set-sink-volume @DEFAULT_SINK@ ${level}%`);

      log.ok(`system_volume set to ${level}%`);

      return {
        success: true,
        data: { currentVolume: level },
      };
    } catch (error) {
      log.error(`system_volume FAILED: ${error.message}`);

      return reply.status(500).send({
        success: false,
        data: { message: "볼륨 조절에 실패했습니다.", error: error.message },
      });
    }
  },
);

// Cron 등록
await fastify.register(cronPlugin, "0 * * * *"); // 매 정시 저장
// 테스트용 인터벌
// await fastify.register(cronPlugin, '*/1 * * * *');

const retryFetchHwId = async () => {
  const INTERVAL = 5000;
  while (!hwId) {
    hwId = await fetchHwId();
    if (hwId) {
      log.ok(`hwId loaded: ${hwId}`);
      registerHardware(hwId);
    } else {
      log.warn(`hwId 로드 실패 — ${INTERVAL / 1000}초 후 재시도`);
      await new Promise((r) => setTimeout(r, INTERVAL));
    }
  }
};

// NOTE: 서버 시작
const start = async () => {
  try {
    await connectDB();
    await fastify.listen({ port: 4000, host: "0.0.0.0" });
    log.info("piCare-back listening on :4000");
    retryFetchHwId(); // 서버 시작 후 백그라운드에서 hwId 로드
  } catch (err) {
    log.error(err.message);
    process.exit(1);
  }
};
start();
