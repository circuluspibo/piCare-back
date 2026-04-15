const C = {
  reset:  '\x1b[0m',
  gray:   '\x1b[90m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
};

const time = () => new Date().toTimeString().slice(0, 8);

const fmt = (color, tag, msg) =>
  `${C.gray}[${time()}]${C.reset} ${color}${tag}${C.reset} ${msg}`;

export const log = {
  info:  (msg) => console.log(fmt(C.cyan,    'INFO ', msg)),
  ok:    (msg) => console.log(fmt(C.green,   ' OK  ', msg)),
  warn:  (msg) => console.warn(fmt(C.yellow, 'WARN ', msg)),
  error: (msg) => console.error(fmt(C.red,   'ERROR', msg)),
  req:   (method, url) =>
    console.log(fmt(C.blue,    ' →   ', `${method} ${url}`)),
  res:   (method, url, status, ms) =>
    console.log(fmt(status < 400 ? C.green : C.red, ` ←   `, `${status} ${method} ${url} ${C.gray}(${ms}ms)${C.reset}`)),
  cron:  (type, msg) =>
    console.log(fmt(C.magenta, 'CRON ', `[${type}] ${msg}`)),
};
