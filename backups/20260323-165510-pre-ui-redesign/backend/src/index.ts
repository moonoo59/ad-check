/**
 * 서버 진입점 (Entry Point)
 *
 * 이 파일은 HTTP 서버를 시작하는 역할만 한다.
 * 비즈니스 로직은 app.ts와 각 모듈에서 처리한다.
 *
 * 시작 순서:
 * 1. 환경변수 로드 (env.ts에서 처리)
 * 2. DB 연결 (database.ts에서 처리)
 * 3. Express 앱 구성 (app.ts에서 처리)
 * 4. HTTP 서버 기동
 *
 * 마운트 관련 기능 제거됨:
 * - 스토리지 마운트/언마운트는 운영자가 macOS에서 직접 수동으로 처리한다.
 */
import app from './app';
import { env } from './config/env';
import db from './config/database';
import { createLogger } from './common/logger';

const log = createLogger('Server');

// DB 연결 확인
try {
  db.prepare('SELECT 1').get();
  log.info(`SQLite 연결 성공`, { path: env.DB_PATH });
} catch (error) {
  log.error('SQLite 연결 실패', { error });
  process.exit(1);
}

// HTTP 서버 기동
const server = app.listen(env.PORT, () => {
  log.info('========================================');
  log.info('  ad-check 서버 기동 완료');
  log.info(`  환경: ${env.NODE_ENV}`);
  log.info(`  주소: http://localhost:${env.PORT}`);
  log.info(`  DB: ${env.DB_PATH}`);
  log.info(`  Logger Storage: ${env.LOGGER_STORAGE_MOUNT}`);
  log.info(`  공유 NAS: ${env.SHARED_NAS_MOUNT}`);
  log.info('========================================');
});

/**
 * 서버 종료 처리 공통 함수
 * SIGTERM/SIGINT 모두 동일 로직으로 처리
 */
function gracefulShutdown(signal: string): void {
  log.info(`${signal} 수신 - 정상 종료 중...`);

  server.close(() => {
    db.close();
    log.info('서버 종료 완료');
    process.exit(0);
  });
}

// 정상 종료 처리 (SIGTERM: 프로세스 종료 신호)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Ctrl+C 처리 (SIGINT)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
