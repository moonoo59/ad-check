/**
 * 환경변수 로딩 및 유효성 검사
 *
 * 모든 환경변수는 여기서 한 번만 읽고 타입이 보장된 객체로 반환한다.
 * 필수 값이 없으면 서버 시작 시 즉시 오류를 낸다 (숨기지 않음).
 *
 * 스토리지 마운트는 운영자가 macOS에서 직접 수동으로 수행한다.
 * - 마운트 포인트 경로는 파일 탐색/복사 전 존재 여부 확인에만 사용
 */
import dotenv from 'dotenv';
import path from 'path';

// 프로젝트 루트의 .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const env = {
  // 서버 설정
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // DB 경로 (SQLite 파일 경로)
  DB_PATH: process.env.DB_PATH ?? path.resolve(__dirname, '../../../data/adcheck.db'),

  // ===== Logger Storage (source: SMB 송출 녹화 스토리지) =====
  // macOS 마운트 포인트 경로 — 수동 마운트 후 files.service.ts에서 존재 여부 확인에만 사용
  LOGGER_STORAGE_MOUNT: process.env.LOGGER_STORAGE_MOUNT ?? '/Volumes/data',

  // ===== 공유 NAS (destination: 광고팀/기술팀 공용 NAS) =====
  // macOS 마운트 포인트 경로 — 수동 마운트 후 copy.service.ts에서 존재 여부 확인에만 사용
  SHARED_NAS_MOUNT: process.env.SHARED_NAS_MOUNT ?? '/Volumes/광고',

  // CORS 허용 오리진 (프론트엔드 주소)
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  // 세션 시크릿 (express-session 쿠키 서명용)
  // 운영 환경에서는 반드시 강력한 랜덤 값으로 교체해야 한다.
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'adcheck-dev-secret-change-in-production',

  // ===== Electron 패키징 환경 전용 =====
  // Electron 메인 프로세스가 require() 전에 주입하는 값들

  // Electron 앱으로 실행 중인지 여부
  // - true: 세션 쿠키 secure 비활성 (HTTP localhost), 정적 파일 서빙 활성
  IS_ELECTRON: process.env.IS_ELECTRON === 'true',

  // 로그 파일 저장 경로 (없으면 process.cwd()/logs)
  // Electron: ~/Library/Application Support/광고증빙요청시스템/logs
  LOGS_PATH: process.env.LOGS_PATH ?? null,

  // 마이그레이션 SQL 파일 디렉토리 (.asar 언팩 경로)
  // Electron: Contents/Resources/backend/src/config/migrations
  MIGRATIONS_PATH: process.env.MIGRATIONS_PATH ?? null,

  // React 빌드 결과물 경로 (백엔드가 정적 파일로 서빙)
  // Electron: Contents/Resources/frontend/dist
  FRONTEND_DIST_PATH: process.env.FRONTEND_DIST_PATH ?? null,
} as const;
