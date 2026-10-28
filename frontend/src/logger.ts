const isDev = import.meta.env.DEV;
const logLevel = import.meta.env.VITE_LOG_LEVEL || (isDev ? 'DEBUG' : 'INFO');
const appName = import.meta.env.VITE_APP_NAME || 'nutrilite-frontend';

const levels: Record<string, number> = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };
const currentLevel = levels[logLevel] || 2;

export const logger = {
  debug: (msg: string, ...args: any[]) => currentLevel <= 1 && console.debug(`${appName} : [DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) => currentLevel <= 2 && console.info(`${appName} : [INFO ] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => currentLevel <= 3 && console.warn(`${appName} : [WARN ] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => currentLevel <= 4 && console.error(`${appName} : [ERROR] ${msg}`, ...args),
  log: (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', msg: string) => {
    if (levels[level] >= currentLevel) console.log(`${appName} : [${level}] ${msg}`);
  }
};