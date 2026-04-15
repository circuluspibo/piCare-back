import axios from "axios";
import "dotenv/config";
import { log } from "../utils/logger.js";

const BASE_URL = process.env.IAPI_BASE_URL;
const CPU_BASE_URL = process.env.CPU_BASE_URL;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
});

const cpuApi = axios.create({
  baseURL: CPU_BASE_URL,
  timeout: 3000,
});

/**
 * CPU 서비스에서 기기 고유 UUID를 조회한다.
 * 실패 시 null을 반환하며 서버 기동을 막지 않는다.
 */
export const fetchHwId = async () => {
  try {
    const { data, status } = await cpuApi.get("/");
    if (status !== 200) throw new Error(`HTTP ${status}`);
    return data.uuid ?? null;
  } catch (error) {
    log.error(`fetchHwId FAILED: ${error.message}`);
    return null;
  }
};

/**
 * DB 서버로 로그를 전송하는 함수
 * 에러 처리는 호출하는 라우트 핸들러의 try-catch에서 담당하도록 throw합니다.
 */
export const postHardwareLog = async (endpoint, params) => {
  try {
    log.info(`RELAY → ${endpoint}`);
    const response = await api.post(endpoint, params);
    log.ok(`RELAY ← ${endpoint} ${response.status}`);
    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    const status = error.response?.status ?? '---';
    log.error(`RELAY FAILED ${status} ${endpoint}: ${errorMsg}`);
    throw new Error(errorMsg);
  }
};
