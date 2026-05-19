import { postAlertLog as sendToIapi } from '../api/index.js';

let hwId = null;

export const setHwId = (id) => { hwId = id; };
export const postAlertLog = (level, message) => sendToIapi(level, message, hwId);
