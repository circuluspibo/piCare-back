import mongoose from 'mongoose';

// 외부 IAPI(circulus-iapi)의 log 컬렉션 스키마와 대응됨
// payload 구조는 endpoint별로 다름 — 아래 주석 참고
//
// 현재 사용 중인 endpoint:
// feature_log    : { hwId, featureId, command, duration }
// interaction_log: { hwId, type, content, analysis }
// status_log     : { hwId, status, network, location }
// activity_log   : { hwId, activityType, value, meta }

const logSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true },
    hwId: { type: String, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    syncStatus: {
      type: String,
      enum: ['pending', 'synced', 'failed'],
      default: 'pending',
    },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Log = mongoose.model('Log', logSchema);
