import cron from 'node-cron';
import { log } from '../utils/logger.js';
import { flushPending } from '../utils/syncLog.js';
import { postAlertLog } from '../utils/alertLog.js';

export default async function cronPlugin(fastify, opts) {
  // 1. Status 수집 크론
  cron.schedule(opts, async () => {
    try {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/cli_manager',
        payload: { type: 'status' },
      });
      const { data } = JSON.parse(response.payload);
      log.cron('status', `hwId=${data?.hwId}`);

      const s = data?.snapshot;
      if (s) {
        const temp = parseFloat(s.temp);
        const cpu  = parseFloat(s.cpu);
        const mem  = parseFloat(s.mem);
        const disk = parseFloat(s.disk);
        if (temp >= 80) postAlertLog('critical', `CPU 온도 과열: ${s.temp}`);
        if (cpu  >= 90) postAlertLog('warning',  `CPU 사용률 높음: ${s.cpu}`);
        if (mem  >= 90) postAlertLog('warning',  `메모리 사용률 높음: ${s.mem}`);
        if (disk >= 90) postAlertLog('warning',  `디스크 사용률 높음: ${s.disk}`);
      }
    } catch (error) {
      log.error(`cron status FAILED: ${error.message}`);
      postAlertLog('warning', `status_log 수집 실패: ${error.message}`);
    }
  });

  // 2. pending 로그 재시도 (5분마다)
  cron.schedule('*/5 * * * *', async () => {
    try {
      await flushPending();
    } catch (error) {
      log.error(`cron flushPending FAILED: ${error.message}`);
      postAlertLog('warning', `pending 로그 flush 실패: ${error.message}`);
    }
  });
}
