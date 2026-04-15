import cron from 'node-cron';
import { log } from '../utils/logger.js';

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
    } catch (error) {
      log.error(`cron status FAILED: ${error.message}`);
    }
  });

  // 2. Activity 수집 크론
  cron.schedule(opts, async () => {
    try {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/cli_manager',
        payload: { type: 'activity' },
      });
      const { data } = JSON.parse(response.payload);
      log.cron('activity', `hwId=${data?.hwId} type=${data?.activityType}`);
    } catch (error) {
      log.error(`cron activity FAILED: ${error.message}`);
    }
  });
}
