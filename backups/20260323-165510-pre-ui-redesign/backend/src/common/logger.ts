/**
 * 구조화 로거 모듈
 *
 * 모든 서비스/미들웨어가 이 로거를 사용한다.
 * console.log를 직접 쓰지 말고 createLogger()로 만든 인스턴스를 사용할 것.
 *
 * 출력 대상:
 *   1. 터미널 콘솔 (레벨별 색상)
 *   2. backend/logs/app-YYYY-MM-DD.log (날짜별 파일, 자동 생성)
 *
 * 사용법:
 *   import { createLogger } from '../../common/logger';
 *   const log = createLogger('Mount');
 *   log.info('마운트 시작', { host: '10.93.101.100' });
 *   log.error('마운트 실패', { error: err.message });
 *
 * 로그 형식:
 *   [2026-03-06 15:30:00] [INFO ] [Mount] 마운트 시작 {"host":"10.93.101.100"}
 */
import fs from 'fs';
import path from 'path';

// ----- 로그 레벨 정의 -----
type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// 터미널 색상 코드
const COLORS: Record<Level, string> = {
  DEBUG: '\x1b[36m',  // 청록 (cyan)
  INFO:  '\x1b[32m',  // 녹색 (green)
  WARN:  '\x1b[33m',  // 노랑 (yellow)
  ERROR: '\x1b[31m',  // 빨강 (red)
};
const RESET = '\x1b[0m';

// 로그 파일 디렉토리
// - 일반 실행: process.cwd()/logs (백엔드 작업 디렉토리 기준)
// - Electron:  ~/Library/Application Support/광고증빙요청시스템/logs (LOGS_PATH 주입)
const LOG_DIR = process.env.LOGS_PATH ?? path.join(process.cwd(), 'logs');

// 시작 시 로그 디렉토리 생성 (없으면 자동 생성)
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 오늘 날짜의 로그 파일 경로 반환
 * 날짜가 바뀌면 자동으로 새 파일에 기록됨
 */
function todayLogFile(): string {
  const date = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  return path.join(LOG_DIR, `app-${date}.log`);
}

/**
 * 타임스탬프 문자열 반환 (로컬 시각, YYYY-MM-DD HH:MM:SS)
 */
function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * 로그 한 줄 출력 (콘솔 + 파일)
 */
function write(level: Level, module: string, message: string, extra?: unknown): void {
  const ts = timestamp();
  // 레벨은 5자리로 고정 (정렬을 위해)
  const levelStr = level.padEnd(5);
  const extraStr = extra !== undefined ? ' ' + JSON.stringify(extra, null, 0) : '';
  const line = `[${ts}] [${levelStr}] [${module}] ${message}${extraStr}`;

  // 콘솔: 색상 포함
  console.log(`${COLORS[level]}${line}${RESET}`);

  // 파일: 색상 코드 없이 순수 텍스트
  try {
    fs.appendFileSync(todayLogFile(), line + '\n', 'utf-8');
  } catch {
    // 파일 쓰기 실패는 서비스에 영향 없도록 무시
  }
}

// ----- 로거 인스턴스 타입 -----
export interface Logger {
  debug: (message: string, extra?: unknown) => void;
  info:  (message: string, extra?: unknown) => void;
  warn:  (message: string, extra?: unknown) => void;
  error: (message: string, extra?: unknown) => void;
}

/**
 * 모듈별 로거 생성
 *
 * @param module 로그에 표시될 모듈 이름 (예: 'Mount', 'FileSearch', 'Copy')
 */
export function createLogger(module: string): Logger {
  return {
    debug: (msg, extra) => write('DEBUG', module, msg, extra),
    info:  (msg, extra) => write('INFO',  module, msg, extra),
    warn:  (msg, extra) => write('WARN',  module, msg, extra),
    error: (msg, extra) => write('ERROR', module, msg, extra),
  };
}

/**
 * morgan HTTP 로그를 파일에도 기록하기 위한 write stream
 * app.ts의 morgan 설정에서 사용
 */
export const morganStream = {
  write: (message: string) => {
    const line = `[${timestamp()}] [INFO ] [HTTP  ] ${message.trim()}`;
    console.log(`${COLORS.INFO}${line}${RESET}`);
    try {
      fs.appendFileSync(todayLogFile(), line + '\n', 'utf-8');
    } catch { /* 무시 */ }
  },
};
