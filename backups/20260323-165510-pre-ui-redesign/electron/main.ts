/**
 * Electron 메인 프로세스
 *
 * 역할:
 *   1. 환경변수 설정 → Express 백엔드 기동 (same Node.js 프로세스)
 *   2. /api/health 폴링으로 서버 준비 대기
 *   3. BrowserWindow 생성 → http://localhost:4000 로드
 *   4. IPC 'app-quit' 수신 시 앱 종료
 *
 * 데이터 저장 위치 (macOS):
 *   ~/Library/Application Support/광고증빙요청시스템/
 *   ├── data/adcheck.db   (SQLite DB)
 *   └── logs/             (날짜별 로그 파일)
 *
 * 마이그레이션 SQL 파일은 .asar 언팩 경로에서 읽는다.
 * (electron-builder: asarUnpack 설정 필요)
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';

const PORT = 4000;

// =====================================================
// 경로 유틸리티
// =====================================================

/**
 * 개발/패키징 환경에 따른 리소스 경로 반환
 * - 개발:     electron/dist/main.js → 프로젝트 루트 기준
 * - 패키지됨: Contents/Resources/ 기준
 */
function resourcePath(...segments: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  // __dirname = electron/dist/ → ../.. = 프로젝트 루트
  return path.join(__dirname, '../..', ...segments);
}

// =====================================================
// 환경변수 주입
// 백엔드 모듈 require() 전에 반드시 호출해야 한다.
// =====================================================

function setupEnv(): void {
  const userDataPath = app.getPath('userData');

  // 쓰기 가능한 디렉토리 미리 생성
  const dbDir   = path.join(userDataPath, 'data');
  const logsDir = path.join(userDataPath, 'logs');
  if (!fs.existsSync(dbDir))   fs.mkdirSync(dbDir,   { recursive: true });
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  // 백엔드 env.ts / logger.ts / database.ts 가 읽는 환경변수 주입
  process.env.NODE_ENV            = 'production';
  process.env.IS_ELECTRON         = 'true';
  process.env.PORT                = String(PORT);
  process.env.DB_PATH             = path.join(dbDir, 'adcheck.db');
  process.env.LOGS_PATH           = logsDir;

  // 마이그레이션 SQL 파일: asarUnpack 으로 꺼낸 실제 파일시스템 경로
  process.env.MIGRATIONS_PATH     = resourcePath('backend', 'src', 'config', 'migrations');

  // 백엔드가 React 정적 파일을 서빙할 경로
  process.env.FRONTEND_DIST_PATH  = resourcePath('frontend', 'dist');

  // 세션 쿠키 서명용 시크릿 (운영 단일PC — 재시작해도 동일)
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = 'adcheck-electron-internal-2026';
  }

  // CORS: 같은 오리진으로 서빙하므로 불필요하지만 설정값 유지
  process.env.CORS_ORIGIN = `http://localhost:${PORT}`;

  // 스토리지 마운트 경로 기본값 (운영자가 macOS에서 수동 마운트)
  if (!process.env.LOGGER_STORAGE_MOUNT) {
    process.env.LOGGER_STORAGE_MOUNT = '/Volumes/data';
  }
  if (!process.env.SHARED_NAS_MOUNT) {
    process.env.SHARED_NAS_MOUNT = '/Volumes/광고';
  }
}

// =====================================================
// 백엔드 서버 준비 대기 (헬스체크 폴링)
// =====================================================

/**
 * /api/health 가 200 을 반환할 때까지 최대 30초 대기
 * 실패 시 reject → 앱 종료
 */
function waitForBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 60; // 60 × 500ms = 30초

    const timer = setInterval(() => {
      attempts++;

      const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(timer);
          resolve();
        }
      });

      req.on('error', () => {
        if (attempts >= maxAttempts) {
          clearInterval(timer);
          reject(new Error('백엔드 서버가 30초 내에 시작되지 않았습니다.'));
        }
      });

      req.setTimeout(400, () => req.destroy());
    }, 500);
  });
}

// =====================================================
// BrowserWindow 생성
// =====================================================

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:    1440,
    height:   900,
    minWidth: 1280,
    minHeight: 720,
    title:    '광고 증빙 요청 시스템',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,   // 보안: 렌더러에서 Node.js 직접 접근 차단
      contextIsolation: true,    // 보안: 렌더러 컨텍스트 격리
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// =====================================================
// IPC 핸들러
// =====================================================

// 렌더러(React GlobalNav 종료 버튼)에서 전송하는 종료 요청
ipcMain.on('app-quit', () => {
  app.quit();
});

// =====================================================
// 앱 생명주기
// =====================================================

app.whenReady().then(async () => {
  // 1. 환경변수 먼저 설정
  setupEnv();

  // 2. 백엔드 진입점 require → Express 서버 자동 기동
  //    (index.ts: HTTP 서버 listen + SIGTERM 핸들러 등록)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(resourcePath('backend', 'dist', 'index.js'));

  // 3. 서버 준비 대기 후 창 생성
  try {
    await waitForBackend();
    createWindow();
  } catch (err) {
    console.error('[Electron] 백엔드 시작 실패:', err);
    app.quit();
  }
});

// macOS: 창이 모두 닫히면 앱 종료
// (내부 업무 도구 — Dock 클릭으로 재활성화 불필요)
app.on('window-all-closed', () => {
  app.quit();
});
