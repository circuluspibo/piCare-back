import mongoose from 'mongoose';
import { log } from '../utils/logger.js';
import { postAlertLog } from '../utils/alertLog.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/picare';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    log.ok('MongoDB connected');
  } catch (error) {
    log.error(`MongoDB FAILED: ${error.message}`);
    postAlertLog('critical', `MongoDB 연결 실패: ${error.message}`);
  }
};
