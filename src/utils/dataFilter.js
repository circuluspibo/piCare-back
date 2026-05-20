import { DEVICE_INFO, NETWOK_INFO, POWER_INFO, SYSTEM_INFO } from '../assets/command.js';
import { runCommand } from './index.js';

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

// 부팅 시점과 가동 시간만 추출
export const parseUptimeData = async () => {
  const raw = await runCommand(POWER_INFO);
  if (!raw || !raw.includes('|')) return { bootedAt: null, uptimeSec: 0 };

  const [onTimeStr] = raw.split('|').map((s) => s.trim());
  const onDate = new Date(onTimeStr);
  if (!isValidDate(onDate)) return { bootedAt: null, uptimeSec: 0 };

  return {
    bootedAt: onDate.toISOString().split('.')[0] + 'Z',
    uptimeSec: Math.max(0, Math.floor((Date.now() - onDate.getTime()) / 1000)),
  };
};

// NOTE: 시스템 정보 파싱
export const parseSystemData = async () => {
  const raw = await runCommand(SYSTEM_INFO);
  const p = (raw || "").split('|').map(s => s.trim());
  
  if (p.length < 6) {
    return { geo: 'N/A', power: 'N/A', temp: 'N/A', cpu: '0.1%', mem: '0.1%', disk: '0.1%' };
  }

  let cpuVal = parseFloat(p[3]);
  if (isNaN(cpuVal) || cpuVal <= 0) cpuVal = 0.1;
  const cpuPercent = `${Math.min(100, cpuVal).toFixed(1)}%`;


  const memRaw = p[4] || "1-0";
  const [total, avail] = memRaw.split('-').map(v => parseInt(v) || 0);

  const used = total - avail;
  const memUsage = total > 0 ? Math.max(0.1, (used / total) * 100) : 0.1;

  let diskPercent = p[5] || "0%";
  if (!diskPercent.includes('%')) {
    diskPercent = `${parseInt(diskPercent.replace(/[^\d]/g, '')) || 0}%`;
  }

  return {
    geo: p[0] || 'Unknown',
    power: p[1] || 'N/A',
    temp: p[2] === '0' || !p[2] ? 'N/A' : `${p[2].replace(/[^\d.]/g, '')}°C`,
    cpu: cpuPercent,
    mem: `${Math.min(100, memUsage).toFixed(1)}%`,
    disk: diskPercent
  };
};

// NOTE: 디바이스 정보 파싱
export const parseDeviceData = async () => {
  const raw = await runCommand(DEVICE_INFO);
  const m = { usbCnt: 0, usbDur: 0, trafficAmount: 0 };
  if (!raw || !raw.includes('|')) return m;

  const parts = raw.split('|').map(s => parseInt(s.trim()) || 0);
  return { usbCnt: parts[0], usbDur: parts[1], trafficAmount: parts[2] };
};

// NOTE: 네트워크 정보 파싱
export const parseNetworkData = async () => {
  const rawData = await runCommand(NETWOK_INFO);
  const defaultConfig = {
    ping: false, down: 0, up: 0, ip: 'N/A', isp: 'N/A', country: 'N/A',
    geo: { lat: 0, lon: 0 }, ssid: 'N/A', freq: 'N/A', signal: 0, ap_count: 0,
  };

  if (!rawData) return defaultConfig;
  const parts = rawData.split('|').map(s => s.trim());


  let externalInfo = {};
  const jsonIdx = parts.findIndex(p => p.startsWith('{'));
  if (jsonIdx !== -1) {
    try {
      externalInfo = JSON.parse(parts[jsonIdx]);
    } catch (e) {
      console.error("JSON Parse Fail");
    }
  }

  const traffic = (parts[1] || '0|0').split('|');
  const loc = (externalInfo.loc || '0,0').split(',');
  const ssidCandidate = parts[4] || 'N/A';
  const ssidFinal = ssidCandidate.startsWith('{') ? (parts[5] || 'N/A') : ssidCandidate;

  return {
    ping: parts[0] === 'Success',
    down: parseInt(traffic[0]) || 0,
    up: parseInt(traffic[1]) || 0,
    ip: parts[2] !== 'N/A' ? parts[2] : (externalInfo.ip || 'N/A'),
    isp: externalInfo.org || 'N/A',
    country: externalInfo.country || 'N/A',
    geo: { lat: parseFloat(loc[0]) || 0, lon: parseFloat(loc[1]) || 0 },
    ssid: ssidFinal,
    freq: parts[5] || 'N/A',
    signal: Math.abs(parseInt(parts[6]) || 0),
    ap_count: parseInt(parts[7]) || 0,
  };
};