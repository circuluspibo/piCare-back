import { Log } from '../models/log.js';
import { postHardwareLog } from '../api/index.js';
import { log } from './logger.js';

const MAX_RETRY = 5;

/**
 * DB에 pending으로 저장 후 즉시 반환.
 * 백그라운드에서 IAPI relay 시도 — 성공 시 synced, 실패 시 pending 유지.
 * DB가 없으면 직접 relay로 폴백.
 */
export const saveAndRelay = async (endpoint, payload) => {
  try {
    const doc = await Log.create({ endpoint, hwId: payload.hwId ?? null, payload });
    postHardwareLog(endpoint, payload)
      .then(() => Log.findByIdAndUpdate(doc._id, { syncStatus: 'synced' }))
      .catch(() => {});
  } catch {
    log.warn(`DB unavailable — direct relay: ${endpoint}`);
    await postHardwareLog(endpoint, payload);
  }
};

/**
 * pending 문서를 순서대로 IAPI로 전송.
 * MAX_RETRY 초과 시 failed 처리.
 */
export const flushPending = async () => {
  const docs = await Log.find({
    syncStatus: 'pending',
    retryCount: { $lt: MAX_RETRY },
  });
  if (!docs.length) return;

  log.info(`SYNC flush: ${docs.length}건`);
  for (const doc of docs) {
    try {
      await postHardwareLog(doc.endpoint, doc.payload);
      await Log.findByIdAndUpdate(doc._id, { syncStatus: 'synced' });
      log.ok(`SYNC OK: ${doc.endpoint} (${doc._id})`);
    } catch {
      const next = doc.retryCount + 1;
      await Log.findByIdAndUpdate(doc._id, {
        retryCount: next,
        ...(next >= MAX_RETRY ? { syncStatus: 'failed' } : {}),
      });
      log.warn(`SYNC FAIL: ${doc.endpoint} retry=${next}`);
    }
  }
};
