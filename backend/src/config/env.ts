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
import os from 'os';
import path from 'path';

// 프로젝트 루트의 .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DEFAULT_DEV_SESSION_SECRET = 'adcheck-dev-secret-change-in-production';
const LEGACY_ELECTRON_SESSION_SECRET = 'adcheck-electron-internal-2026';
const DEFAULT_PUBLIC_BASE_URL = 'http://adcheck.tech.net';
const port = parseInt(process.env.PORT ?? '4000', 10);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_APP_SUPPORT_DIR = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'AdCheck')
  : path.join(PROJECT_ROOT, '.runtime', 'AdCheck');
const APP_SUPPORT_DIR = resolveEnvPath(process.env.APP_SUPPORT_DIR ?? DEFAULT_APP_SUPPORT_DIR, PROJECT_ROOT);

function resolveEnvPath(value: string, baseDir: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function resolveSessionSecret(): string {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const isUnsafeSecret = !sessionSecret
    || sessionSecret === DEFAULT_DEV_SESSION_SECRET
    || sessionSecret === LEGACY_ELECTRON_SESSION_SECRET;

  if (nodeEnv === 'production' && isUnsafeSecret) {
    throw new Error(
      '운영 환경에서는 SESSION_SECRET 기본값을 사용할 수 없습니다. '
      + '백엔드 단독 실행 시 .env에 강력한 랜덤 값을 설정하고, Electron 앱은 설치별 시크릿을 먼저 주입해야 합니다.',
    );
  }

  return sessionSecret || DEFAULT_DEV_SESSION_SECRET;
}

export const env = {
  // 서버 설정
  PORT: port,
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // 개발 서버와 패키징 앱이 함께 공유하는 런타임 데이터 루트
  APP_SUPPORT_DIR,

  // 내부망 사용자가 브라우저로 접속할 때 사용할 대표 주소
  // 미설정 시 운영 도메인(adcheck.tech.net)을 기본값으로 사용한다.
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL?.trim() || DEFAULT_PUBLIC_BASE_URL,

  // DB 경로 (SQLite 파일 경로)
  // - 기본값은 Application Support/AdCheck 아래의 공용 DB 경로다.
  // - 개발 서버와 패키징 앱이 같은 DB를 사용한다.
  // - 명시적으로 DB_PATH를 주면 그 값을 우선한다.
  DB_PATH: resolveEnvPath(process.env.DB_PATH ?? path.join(APP_SUPPORT_DIR, 'data', 'adcheck.db'), BACKEND_ROOT),

  // ===== Logger Storage (source: SMB 송출 녹화 스토리지) =====
  // macOS 마운트 포인트 경로 — 수동 마운트 후 files.service.ts에서 존재 여부 확인에만 사용
  LOGGER_STORAGE_MOUNT: process.env.LOGGER_STORAGE_MOUNT ?? '/Volumes/data',

  // ===== 공유 NAS (destination: 기존 NAS, 당분간 하위 호환용으로 유지) =====
  // macOS 마운트 포인트 경로 — 수동 마운트 후 copy.service.ts에서 존재 여부 확인에만 사용
  SHARED_NAS_MOUNT: process.env.SHARED_NAS_MOUNT ?? '/Volumes/광고',

  // ===== 로컬 전달 스토리지 (destination: 서버 로컬 디스크, 웹 다운로드용) =====
  // 복사 완료 파일을 저장하는 로컬 경로. 1일 후 자동 삭제.
  // 기본값은 공용 앱 데이터 디렉토리 아래의 delivery 경로다.
  // 개발 서버와 패키징 앱이 같은 다운로드/정리 경로를 공유한다.
  LOCAL_DELIVERY_PATH: resolveEnvPath(
    process.env.LOCAL_DELIVERY_PATH ?? path.join(APP_SUPPORT_DIR, 'data', 'delivery'),
    PROJECT_ROOT,
  ),

  // 과거 버전은 backend 프로세스 cwd 기준으로 상대 경로를 저장해
  // <repo>/backend/backend/data/delivery 형태가 생성될 수 있었다.
  // 자동 정리/다운로드에서 레거시 경로 호환용으로만 사용한다.
  LEGACY_LOCAL_DELIVERY_PATH: path.isAbsolute(process.env.LOCAL_DELIVERY_PATH ?? 'backend/data/delivery')
    ? null
    : path.resolve(BACKEND_ROOT, process.env.LOCAL_DELIVERY_PATH ?? 'backend/data/delivery'),

  // CORS 허용 오리진 (프론트엔드 주소)
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:4000',

  // 세션 시크릿 (express-session 쿠키 서명용)
  // 개발 환경에서만 기본값 허용. 운영 환경은 설치별/배포별 고유 값이 필수다.
  SESSION_SECRET: resolveSessionSecret(),

  // ===== Electron 패키징 환경 전용 =====
  // Electron 메인 프로세스가 require() 전에 주입하는 값들

  // Electron 앱으로 실행 중인지 여부
  // - true: 세션 쿠키 secure 비활성 (HTTP localhost), 정적 파일 서빙 활성
  IS_ELECTRON: process.env.IS_ELECTRON === 'true',

  // 로그 파일 저장 경로 (기본: Application Support/AdCheck/logs)
  LOGS_PATH: resolveEnvPath(process.env.LOGS_PATH ?? path.join(APP_SUPPORT_DIR, 'logs'), PROJECT_ROOT),

  // 마이그레이션 SQL 파일 디렉토리 (.asar 언팩 경로)
  // Electron: Contents/Resources/backend/src/config/migrations
  MIGRATIONS_PATH: process.env.MIGRATIONS_PATH ?? null,

  // React 빌드 결과물 경로 (백엔드가 정적 파일로 서빙)
  // 예: <project>/frontend/dist 또는 Electron의 Contents/Resources/frontend/dist
  FRONTEND_DIST_PATH: process.env.FRONTEND_DIST_PATH
    ? resolveEnvPath(process.env.FRONTEND_DIST_PATH, PROJECT_ROOT)
    : null,
} as const;
