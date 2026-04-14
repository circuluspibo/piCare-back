import axios from 'axios';
import 'dotenv/config';

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
    const { data, status } = await cpuApi.get('/');
    if (status !== 200) throw new Error(`HTTP ${status}`);
    return data.uuid ?? null;
  } catch (error) {
    console.error('[FAILED] fetchHwId:', error.message);
    return null;
  }
};

/**
 * DB 서버로 로그를 전송하는 함수
 * 에러 처리는 호출하는 라우트 핸들러의 try-catch에서 담당하도록 throw합니다.
 */
export const postHardwareLog = async (endpoint, params) => {
  try {
    console.log(`[RELAY TO DB] ${endpoint}`, params);

    // axios는 기본적으로 2xx가 아니면 에러를 던집니다.
    const response = await api.post(endpoint, params);

    return response.data;
  } catch (error) {
    // 1. axios 에러인 경우 상세 메시지 추출
    const errorMsg = error.response?.data?.message || error.message;
    console.error(`[AXIOS ERROR] ${endpoint}: ${errorMsg}`);

    // 2. 상위 라우터로 에러를 던져야 라우터의 catch가 작동합니다.
    throw new Error(errorMsg);
  }
};
