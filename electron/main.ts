import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { randomBytes } from 'crypto';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
type ServerOwnership = 'managed' | 'external' | 'none';
type ControlLogLevel = 'INFO' | 'WARN' | 'ERROR';

interface PackagedConfig {
  appPort?: number;
  publicBaseUrl?: string;
}

interface RuntimePaths {
  appSupportDir: string;
  dbPath: string;
  deliveryPath: string;
  logsPath: string;
  runDir: string;
  pidFile: string;
  port: number;
  localBaseUrl: string;
  publicBaseUrl: string;
  sessionSecret: string;
  migrationsPath: string;
  frontendDistPath: string;
  backendEntryPath: string;
  nodeBinaryPath: string;
}

interface ServerState {
  status: ServerStatus;
  ownership: ServerOwnership;
  pid: number | null;
  managedByControlApp: boolean;
  localBaseUrl: string;
  publicBaseUrl: string;
  appSupportDir: string;
  dbPath: string;
  deliveryPath: string;
  logsPath: string;
  pidFile: string;
  lastError: string | null;
}

interface HealthPayload {
  server?: string;
  db?: string;
  public_base_url?: string;
  local_base_url?: string;
}

const APP_NAME = '광고증빙요청시스템';
const APP_BUNDLE_ID = 'com.broadcast.adcheck';
const DEFAULT_PORT = 4000;
const DEFAULT_PUBLIC_BASE_URL = 'http://adcheck.tech.net';
const DEFAULT_DEV_SESSION_SECRET = 'adcheck-dev-secret-change-in-production';
const LEGACY_ELECTRON_SESSION_SECRET = 'adcheck-electron-internal-2026';
const HEALTH_TIMEOUT_MS = 1_000;
const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 10_000;
const LOG_TAIL_LINES = 20;

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let runtimePaths: RuntimePaths | null = null;
let windowCloseApproved = false;

const initialState: ServerState = {
  status: 'stopped',
  ownership: 'none',
  pid: null,
  managedByControlApp: false,
  localBaseUrl: `http://localhost:${DEFAULT_PORT}`,
  publicBaseUrl: DEFAULT_PUBLIC_BASE_URL,
  appSupportDir: '',
  dbPath: '',
  deliveryPath: '',
  logsPath: '',
  pidFile: '',
  lastError: null,
};

let serverState: ServerState = { ...initialState };

function appSourcePath(...segments: string[]): string {
  const basePath = app.isPackaged
    ? app.getAppPath()
    : path.join(__dirname, '../..');
  return path.join(basePath, ...segments);
}

function rendererPath(...segments: string[]): string {
  return app.isPackaged
    ? appSourcePath('renderer', ...segments)
    : path.join(__dirname, '..', 'renderer', ...segments);
}

function readPackagedConfig(): PackagedConfig {
  const configPath = appSourcePath('config', 'control-app.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as PackagedConfig;
  } catch {
    return {};
  }
}

function resolvePort(packagedConfig: PackagedConfig): number {
  const rawValue = process.env.APP_PORT ?? process.env.PORT ?? packagedConfig.appPort;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function resolveAppSupportDir(): string {
  if (process.env.APP_SUPPORT_DIR?.trim()) {
    return path.resolve(process.env.APP_SUPPORT_DIR.trim());
  }

  return process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'AdCheck')
    : path.join(appSourcePath(), '.runtime', 'AdCheck');
}

function isUnsafeSessionSecret(secret?: string): boolean {
  const trimmed = secret?.trim();
  return !trimmed
    || trimmed === DEFAULT_DEV_SESSION_SECRET
    || trimmed === LEGACY_ELECTRON_SESSION_SECRET;
}

function loadOrCreateSessionSecret(appSupportDir: string, nodeBinaryPath: string): string {
  const providedSecret = process.env.SESSION_SECRET?.trim();
  if (!isUnsafeSessionSecret(providedSecret)) {
    return providedSecret!;
  }

  const configDir = path.join(appSupportDir, 'config');
  const secretFile = path.join(configDir, 'session-secret');
  fs.mkdirSync(configDir, { recursive: true });

  if (fs.existsSync(secretFile)) {
    const savedSecret = fs.readFileSync(secretFile, 'utf8').trim();
    if (!isUnsafeSessionSecret(savedSecret)) {
      try {
        fs.chmodSync(secretFile, 0o600);
      } catch {
        // ignore chmod failures on non-POSIX filesystems
      }
      return savedSecret;
    }
  }

  let generatedSecret = randomBytes(48).toString('hex');
  try {
    generatedSecret = spawnSyncOutput(nodeBinaryPath, [
      '-e',
      "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))",
    ]) || generatedSecret;
  } catch {
    // fall back to current process crypto output
  }

  fs.writeFileSync(secretFile, generatedSecret, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(secretFile, 0o600);
  } catch {
    // ignore chmod failures
  }
  return generatedSecret;
}

function spawnSyncOutput(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.stdout?.trim() || '';
}

function resolveRuntimePaths(): RuntimePaths {
  if (runtimePaths) {
    return runtimePaths;
  }

  const packagedConfig = readPackagedConfig();
  const port = resolvePort(packagedConfig);
  const localBaseUrl = `http://localhost:${port}`;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim()
    || packagedConfig.publicBaseUrl?.trim()
    || DEFAULT_PUBLIC_BASE_URL;
  const appSupportDir = resolveAppSupportDir();
  const logsPath = process.env.LOGS_PATH?.trim()
    ? path.resolve(process.env.LOGS_PATH)
    : path.join(appSupportDir, 'logs');
  const runDir = path.join(appSupportDir, 'run');
  const nodeBinaryPath = app.isPackaged
    ? appSourcePath('bin', 'node')
    : process.env.AD_CHECK_NODE_BIN?.trim() || 'node';

  runtimePaths = {
    appSupportDir,
    dbPath: process.env.DB_PATH?.trim()
      ? path.resolve(process.env.DB_PATH)
      : path.join(appSupportDir, 'data', 'adcheck.db'),
    deliveryPath: process.env.LOCAL_DELIVERY_PATH?.trim()
      ? path.resolve(process.env.LOCAL_DELIVERY_PATH)
      : path.join(appSupportDir, 'data', 'delivery'),
    logsPath,
    runDir,
    pidFile: path.join(runDir, 'backend.pid'),
    port,
    localBaseUrl,
    publicBaseUrl,
    sessionSecret: loadOrCreateSessionSecret(appSupportDir, nodeBinaryPath),
    migrationsPath: appSourcePath('backend', 'dist', 'config', 'migrations'),
    frontendDistPath: appSourcePath('frontend', 'dist'),
    backendEntryPath: appSourcePath('backend', 'dist', 'index.js'),
    nodeBinaryPath,
  };

  return runtimePaths;
}

function ensureRuntimeDirectories(paths: RuntimePaths): void {
  [
    paths.appSupportDir,
    path.dirname(paths.dbPath),
    paths.deliveryPath,
    paths.logsPath,
    paths.runDir,
  ].forEach((dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
  });
}

function nowTimestamp(): string {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function todayLogPath(logsPath: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logsPath, `app-${date}.log`);
}

function appendControlLog(level: ControlLogLevel, message: string, extra?: unknown): void {
  const paths = resolveRuntimePaths();
  ensureRuntimeDirectories(paths);
  const extraText = extra !== undefined ? ` ${JSON.stringify(extra)}` : '';
  const line = `[${nowTimestamp()}] [${level.padEnd(5)}] [Control] ${message}${extraText}`;
  fs.appendFileSync(todayLogPath(paths.logsPath), `${line}\n`, 'utf8');
}

function updateServerState(partial: Partial<ServerState>): ServerState {
  const paths = resolveRuntimePaths();
  serverState = {
    ...serverState,
    localBaseUrl: paths.localBaseUrl,
    publicBaseUrl: paths.publicBaseUrl,
    appSupportDir: paths.appSupportDir,
    dbPath: paths.dbPath,
    deliveryPath: paths.deliveryPath,
    logsPath: paths.logsPath,
    pidFile: paths.pidFile,
    ...partial,
  };
  return serverState;
}

function readPidFile(paths: RuntimePaths): number | null {
  if (!fs.existsSync(paths.pidFile)) {
    return null;
  }

  const rawPid = fs.readFileSync(paths.pidFile, 'utf8').trim();
  const parsedPid = Number(rawPid);
  return Number.isFinite(parsedPid) && parsedPid > 0 ? parsedPid : null;
}

function writePidFile(paths: RuntimePaths, pid: number): void {
  fs.writeFileSync(paths.pidFile, `${pid}\n`, 'utf8');
}

function clearPidFile(paths: RuntimePaths, expectedPid?: number | null): void {
  if (!fs.existsSync(paths.pidFile)) {
    return;
  }

  if (expectedPid) {
    const currentPid = readPidFile(paths);
    if (currentPid !== expectedPid) {
      return;
    }
  }

  fs.rmSync(paths.pidFile, { force: true });
}

function isPidRunning(pid: number | null): boolean {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestHealth(localBaseUrl: string): Promise<HealthPayload | null> {
  return new Promise((resolve) => {
    const req = http.get(`${localBaseUrl}/api/health`, { timeout: HEALTH_TIMEOUT_MS }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { data?: HealthPayload };
          resolve(parsed.data ?? null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => {
      resolve(null);
    });
  });
}

async function waitForHealth(paths: RuntimePaths, shouldBeRunning: boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const health = await requestHealth(paths.localBaseUrl);
    if (shouldBeRunning && health) {
      return true;
    }
    if (!shouldBeRunning && !health) {
      return true;
    }

    await wait(400);
  }

  return false;
}

async function refreshServerState(): Promise<ServerState> {
  const paths = resolveRuntimePaths();
  ensureRuntimeDirectories(paths);

  const pidFromFile = readPidFile(paths);
  if (pidFromFile && !isPidRunning(pidFromFile)) {
    clearPidFile(paths, pidFromFile);
  }

  const managedPid = readPidFile(paths);
  const health = await requestHealth(paths.localBaseUrl);

  if (managedPid && health) {
    return updateServerState({
      status: 'running',
      ownership: 'managed',
      managedByControlApp: true,
      pid: managedPid,
      lastError: null,
    });
  }

  if (health) {
    return updateServerState({
      status: 'running',
      ownership: 'external',
      managedByControlApp: false,
      pid: null,
      lastError: null,
    });
  }

  if (serverState.status === 'error' && serverState.lastError) {
    return updateServerState({
      ownership: 'none',
      managedByControlApp: false,
      pid: null,
    });
  }

  return updateServerState({
    status: 'stopped',
    ownership: 'none',
    managedByControlApp: false,
    pid: null,
    lastError: null,
  });
}

function backendEnv(paths: RuntimePaths): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'production',
    IS_ELECTRON: 'true',
    PORT: String(paths.port),
    APP_SUPPORT_DIR: paths.appSupportDir,
    DB_PATH: paths.dbPath,
    LOGS_PATH: paths.logsPath,
    LOCAL_DELIVERY_PATH: paths.deliveryPath,
    MIGRATIONS_PATH: paths.migrationsPath,
    FRONTEND_DIST_PATH: paths.frontendDistPath,
    CORS_ORIGIN: paths.localBaseUrl,
    PUBLIC_BASE_URL: paths.publicBaseUrl,
    LOGGER_STORAGE_MOUNT: process.env.LOGGER_STORAGE_MOUNT || '/Volumes/data',
    SHARED_NAS_MOUNT: process.env.SHARED_NAS_MOUNT || '/Volumes/광고',
    SESSION_SECRET: paths.sessionSecret,
  };
}

async function startServer(): Promise<ServerState> {
  const paths = resolveRuntimePaths();
  ensureRuntimeDirectories(paths);

  await refreshServerState();

  if (serverState.ownership === 'external') {
    return updateServerState({
      status: 'error',
      lastError: `이미 다른 프로세스가 ${paths.localBaseUrl}에서 실행 중입니다.`,
    });
  }

  if (serverState.status === 'running' || serverState.status === 'starting') {
    return serverState;
  }

  if (!fs.existsSync(paths.nodeBinaryPath) && app.isPackaged) {
    return updateServerState({
      status: 'error',
      lastError: '앱 내부 Node 런타임을 찾을 수 없습니다. 앱을 다시 생성하세요.',
    });
  }

  if (!fs.existsSync(paths.backendEntryPath)) {
    return updateServerState({
      status: 'error',
      lastError: '앱 내부 백엔드 실행 파일이 없습니다. 앱을 다시 생성하세요.',
    });
  }

  if (!fs.existsSync(paths.frontendDistPath)) {
    return updateServerState({
      status: 'error',
      lastError: '앱 내부 프론트엔드 산출물이 없습니다. 앱을 다시 생성하세요.',
    });
  }

  appendControlLog('INFO', '서버 시작 요청');
  updateServerState({
    status: 'starting',
    ownership: 'managed',
    managedByControlApp: true,
    pid: null,
    lastError: null,
  });

  serverProcess = spawn(paths.nodeBinaryPath, [paths.backendEntryPath], {
    cwd: appSourcePath(),
    env: backendEnv(paths),
    stdio: 'ignore',
  });

  if (!serverProcess.pid) {
    serverProcess = null;
    return updateServerState({
      status: 'error',
      ownership: 'none',
      managedByControlApp: false,
      pid: null,
      lastError: '백엔드 프로세스를 시작하지 못했습니다.',
    });
  }

  writePidFile(paths, serverProcess.pid);

  serverProcess.once('exit', (code, signal) => {
    const exitedPid = serverProcess?.pid ?? readPidFile(paths);
    clearPidFile(paths, exitedPid ?? null);
    serverProcess = null;

    if (serverState.status === 'stopping') {
      appendControlLog('INFO', '서버 종료 완료', { code, signal });
      void refreshServerState();
      return;
    }

    appendControlLog('ERROR', '서버가 예상치 못하게 종료되었습니다.', { code, signal });
    updateServerState({
      status: 'error',
      ownership: 'none',
      managedByControlApp: false,
      pid: null,
      lastError: '서버가 비정상 종료되었습니다. 최근 로그를 확인하세요.',
    });
  });

  const ready = await waitForHealth(paths, true, START_TIMEOUT_MS);
  if (!ready) {
    await stopServer(true);
    return updateServerState({
      status: 'error',
      ownership: 'none',
      managedByControlApp: false,
      pid: null,
      lastError: '서버가 30초 내에 시작되지 않았습니다.',
    });
  }

  const refreshedState = await refreshServerState();
  appendControlLog('INFO', '서버 시작 완료', { localBaseUrl: paths.localBaseUrl });
  void shell.openExternal(paths.localBaseUrl);
  return refreshedState;
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) {
      return true;
    }
    await wait(300);
  }
  return !isPidRunning(pid);
}

async function stopServer(internalCall = false): Promise<ServerState> {
  const paths = resolveRuntimePaths();
  await refreshServerState();

  if (serverState.ownership === 'external') {
    return updateServerState({
      status: 'error',
      lastError: '외부에서 실행한 서버는 제어 앱에서 중지할 수 없습니다.',
    });
  }

  const targetPid = serverProcess?.pid ?? readPidFile(paths);
  if (!targetPid) {
    return updateServerState({
      status: 'stopped',
      ownership: 'none',
      managedByControlApp: false,
      pid: null,
      lastError: internalCall ? serverState.lastError : null,
    });
  }

  appendControlLog('INFO', '서버 중지 요청', { pid: targetPid });
  updateServerState({
    status: 'stopping',
    ownership: 'managed',
    managedByControlApp: true,
    pid: targetPid,
    lastError: null,
  });

  try {
    process.kill(targetPid, 'SIGTERM');
  } catch {
    clearPidFile(paths, targetPid);
    return refreshServerState();
  }

  const stoppedGracefully = await waitForHealth(paths, false, STOP_TIMEOUT_MS);
  if (!stoppedGracefully && isPidRunning(targetPid)) {
    appendControlLog('WARN', '정상 종료 시간이 초과되어 강제 종료합니다.', { pid: targetPid });
    try {
      process.kill(targetPid, 'SIGKILL');
    } catch {
      // ignore
    }
    await waitForPidExit(targetPid, 2_000);
  }

  clearPidFile(paths, targetPid);
  serverProcess = null;
  appendControlLog('INFO', '서버 중지 완료', { pid: targetPid });

  const refreshedState = await refreshServerState();
  return updateServerState({
    ...refreshedState,
    status: refreshedState.status === 'running' ? 'running' : 'stopped',
  });
}

function latestLogFile(logsPath: string): string | null {
  if (!fs.existsSync(logsPath)) {
    return null;
  }

  const candidates = fs.readdirSync(logsPath)
    .filter((fileName) => fileName.endsWith('.log'))
    .map((fileName) => {
      const filePath = path.join(logsPath, fileName);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0]?.filePath ?? null;
}

function readLastLines(filePath: string, maxLines: number): string[] {
  const content = fs.readFileSync(filePath, 'utf8').trimEnd();
  if (!content) {
    return [];
  }

  return content.split(/\r?\n/).slice(-maxLines);
}

function currentLogPreview(): { lines: string[]; filePath: string | null } {
  const paths = resolveRuntimePaths();
  ensureRuntimeDirectories(paths);
  const filePath = latestLogFile(paths.logsPath);
  if (!filePath) {
    return { lines: ['로그 파일이 아직 생성되지 않았습니다.'], filePath: null };
  }

  return {
    lines: readLastLines(filePath, LOG_TAIL_LINES),
    filePath,
  };
}

async function openService(): Promise<ServerState> {
  const state = await refreshServerState();
  if (state.status !== 'running') {
    return updateServerState({
      status: 'error',
      lastError: '서버가 실행 중이 아닙니다. 먼저 [서버 시작]을 눌러주세요.',
    });
  }

  await shell.openExternal(state.localBaseUrl);
  return state;
}

async function openLogFile(): Promise<{ ok: boolean; path: string | null; message: string }> {
  const preview = currentLogPreview();
  const targetPath = preview.filePath || resolveRuntimePaths().logsPath;
  const result = await shell.openPath(targetPath);
  return {
    ok: result === '',
    path: preview.filePath,
    message: result || '로그 파일을 열었습니다.',
  };
}

async function quitControlApp(): Promise<{ ok: boolean }> {
  await refreshServerState();

  if (serverState.ownership === 'external') {
    updateServerState({
      status: 'error',
      lastError: '외부에서 실행한 서버는 제어 앱에서 중지할 수 없습니다. 실행 중인 서버를 먼저 종료한 뒤 다시 시도하세요.',
    });
    return { ok: false };
  }

  windowCloseApproved = true;

  if (serverState.ownership === 'managed' || readPidFile(resolveRuntimePaths())) {
    await stopServer(true);
  }

  app.quit();
  return { ok: true };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 1060,
    minHeight: 760,
    title: APP_NAME,
    backgroundColor: '#f4efe8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(rendererPath('index.html'));

  mainWindow.on('close', (event) => {
    if (windowCloseApproved) {
      return;
    }
    event.preventDefault();
    void quitControlApp();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('control:get-server-status', async () => refreshServerState());
  ipcMain.handle('control:start-server', async () => startServer());
  ipcMain.handle('control:stop-server', async () => stopServer());
  ipcMain.handle('control:open-service', async () => openService());
  ipcMain.handle('control:open-log-file', async () => openLogFile());
  ipcMain.handle('control:read-recent-logs', async () => currentLogPreview());
  ipcMain.handle('control:quit-app', async () => quitControlApp());
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_BUNDLE_ID);

app.whenReady().then(async () => {
  const paths = resolveRuntimePaths();
  ensureRuntimeDirectories(paths);
  updateServerState({
    appSupportDir: paths.appSupportDir,
    dbPath: paths.dbPath,
    deliveryPath: paths.deliveryPath,
    logsPath: paths.logsPath,
    localBaseUrl: paths.localBaseUrl,
    publicBaseUrl: paths.publicBaseUrl,
    pidFile: paths.pidFile,
  });
  registerIpcHandlers();
  await refreshServerState();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowCloseApproved = false;
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
