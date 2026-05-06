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
import fs from 'fs';
import app from './app';
import { env } from './config/env';
import db from './config/database';
import { createLogger } from './common/logger';
import { cleanupExpiredDeliveries } from './modules/files/delivery-cleanup.service';

const log = createLogger('Server');

// DB 연결 확인
try {
  db.prepare('SELECT 1').get();
  log.info(`SQLite 연결 성공`, { path: env.DB_PATH });
} catch (error) {
  log.error('SQLite 연결 실패', { error });
  process.exit(1);
}

// 로컬 전달 스토리지 경로 확인 및 자동 생성
try {
  if (!fs.existsSync(env.LOCAL_DELIVERY_PATH)) {
    fs.mkdirSync(env.LOCAL_DELIVERY_PATH, { recursive: true });
    log.info(`로컬 전달 디렉토리 생성 완료`, { path: env.LOCAL_DELIVERY_PATH });
  }
} catch (error) {
  log.error('로컬 전달 디렉토리 생성 실패', { path: env.LOCAL_DELIVERY_PATH, error });
  process.exit(1);
}

// macOS 보안 권한 선제적 요청 (Pre-flight)
// 서버 기동 시 네트워크 드라이브를 한 번 읽어서 다이얼로그를 미리 띄웁니다.
// 이 작업은 비동기로 진행하여 서버 기동 자체를 방해하지 않습니다.
log.info('네트워크 드라이브 접근 권한 확인 중...', { path: env.LOGGER_STORAGE_MOUNT });
fs.readdir(env.LOGGER_STORAGE_MOUNT, (err) => {
  if (err) {
    log.warn('네트워크 드라이브 접근 확인 실패 (마운트되지 않았거나 권한 거부)', { 
      path: env.LOGGER_STORAGE_MOUNT, 
      error: err.message 
    });
  } else {
    log.info('네트워크 드라이브 접근 권한 확인 완료');
  }
});

// HTTP 서버 기동
const server = app.listen(env.PORT, () => {
  log.info('========================================');
  log.info('  ad-check 서버 기동 완료');
  log.info(`  환경: ${env.NODE_ENV}`);
  log.info(`  로컬 주소: http://localhost:${env.PORT}`);
  log.info(`  서비스 주소: ${env.PUBLIC_BASE_URL}`);
  log.info(`  DB: ${env.DB_PATH}`);
  log.info(`  Logger Storage: ${env.LOGGER_STORAGE_MOUNT}`);
  log.info(`  로컬 전달 경로: ${env.LOCAL_DELIVERY_PATH}`);
  log.info('========================================');

  // 서버 기동 직후 1회 정리 실행 (이전 실행에서 삭제 못한 파일 처리)
  cleanupExpiredDeliveries().catch((err) => {
    log.error('초기 전달 스토리지 정리 실패', { error: err });
  });

  // 이후 1시간마다 정기 정리
  setInterval(() => {
    cleanupExpiredDeliveries().catch((err) => {
      log.error('정기 전달 스토리지 정리 실패', { error: err });
    });
  }, 60 * 60 * 1000); // 1시간 (ms)
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
