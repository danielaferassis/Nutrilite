// Ex.: 2026-10-15 12:29:11 - nutrilite-frontend : [INFO ] mensagem
//
// Uso:
//   logger.info('...'), logger.debug('...'), logger.warn('...'), logger.error('...', erro)
//   logger.log('WARN', '...')  // nível escolhido na chamada

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

const LEVELS: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 }

const OUTPUT: Record<LogLevel, (...data: unknown[]) => void> = {
  DEBUG: console.debug,
  INFO: console.info,
  WARN: console.warn,
  ERROR: console.error,
}

const APP_NAME = import.meta.env.VITE_APP_NAME || 'nutrilite-frontend'

function minLevel(): LogLevel {
  const level = import.meta.env.VITE_LOG_LEVEL?.toUpperCase()
  if (level && level in LEVELS) return level as LogLevel
  return import.meta.env.DEV ? 'DEBUG' : 'INFO'
}

const MIN_LEVEL = minLevel()

function timestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return `${date} ${time}`
}

function log(level: LogLevel, message: string, ...extra: unknown[]): void {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return
  OUTPUT[level](`${timestamp()} - ${APP_NAME} : [${level.padEnd(5)}] ${message}`, ...extra)
}

export const logger = {
  log,
  debug: (message: string, ...extra: unknown[]) => log('DEBUG', message, ...extra),
  info: (message: string, ...extra: unknown[]) => log('INFO', message, ...extra),
  warn: (message: string, ...extra: unknown[]) => log('WARN', message, ...extra),
  error: (message: string, ...extra: unknown[]) => log('ERROR', message, ...extra),
}
