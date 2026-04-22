const STATUS_COPY = {
  stopped: '서버가 실행 중이 아닙니다. [서버 시작]을 눌러 서비스를 열어주세요.',
  starting: '백엔드를 시작하고 헬스체크를 기다리고 있습니다. 로그를 보면서 잠시만 기다려주세요.',
  running: '서비스가 정상 실행 중입니다. 내부망 사용자는 공용 주소로, 서비스 PC에서는 로컬 주소로 접속하면 됩니다.',
  stopping: '정상 종료를 진행 중입니다. PID 정리와 헬스체크 종료를 기다립니다.',
  error: '문제가 발생했습니다. 최근 로그와 오류 메시지를 확인한 뒤 다시 시작해 주세요.',
};

const OWNERSHIP_LABEL = {
  managed: '제어 앱 관리',
  external: '외부 실행 감지',
  none: '대기 중',
};

const STATUS_LABEL = {
  stopped: '정지',
  starting: '시작 중',
  running: '실행 중',
  stopping: '중지 중',
  error: '오류',
};

const stateElements = {
  statusBadge: document.querySelector('#statusBadge'),
  statusDescription: document.querySelector('#statusDescription'),
  errorBanner: document.querySelector('#errorBanner'),
  ownershipValue: document.querySelector('#ownershipValue'),
  pidValue: document.querySelector('#pidValue'),
  publicUrlValue: document.querySelector('#publicUrlValue'),
  localUrlValue: document.querySelector('#localUrlValue'),
  appSupportValue: document.querySelector('#appSupportValue'),
  dbPathValue: document.querySelector('#dbPathValue'),
  deliveryPathValue: document.querySelector('#deliveryPathValue'),
  logsPathValue: document.querySelector('#logsPathValue'),
  pidFileValue: document.querySelector('#pidFileValue'),
  logOutput: document.querySelector('#logOutput'),
  logFilePath: document.querySelector('#logFilePath'),
  startButton: document.querySelector('#startButton'),
  stopButton: document.querySelector('#stopButton'),
  openServiceButton: document.querySelector('#openServiceButton'),
  openLogsButton: document.querySelector('#openLogsButton'),
  quitButton: document.querySelector('#quitButton'),
};

let pendingAction = false;

function setText(element, value) {
  element.textContent = value;
}

function setError(message) {
  if (!message) {
    stateElements.errorBanner.classList.add('hidden');
    stateElements.errorBanner.textContent = '';
    return;
  }

  stateElements.errorBanner.classList.remove('hidden');
  stateElements.errorBanner.textContent = message;
}

function renderState(state) {
  stateElements.statusBadge.className = `status-badge status-badge--${state.status}`;
  setText(stateElements.statusBadge, STATUS_LABEL[state.status] || state.status);
  setText(stateElements.statusDescription, STATUS_COPY[state.status] || STATUS_COPY.stopped);

  if (state.ownership === 'external') {
    setText(
      stateElements.statusDescription,
      '같은 포트에서 이미 다른 서버가 응답 중입니다. 서비스 열기와 로그 확인은 가능하지만 서버 중지는 지원하지 않습니다.',
    );
  }

  setError(state.lastError);
  setText(stateElements.ownershipValue, OWNERSHIP_LABEL[state.ownership] || OWNERSHIP_LABEL.none);
  setText(stateElements.pidValue, state.pid ? String(state.pid) : '-');
  setText(stateElements.publicUrlValue, state.publicBaseUrl || '-');
  setText(stateElements.localUrlValue, state.localBaseUrl || '-');
  setText(stateElements.appSupportValue, state.appSupportDir || '-');
  setText(stateElements.dbPathValue, state.dbPath || '-');
  setText(stateElements.deliveryPathValue, state.deliveryPath || '-');
  setText(stateElements.logsPathValue, state.logsPath || '-');
  setText(stateElements.pidFileValue, state.pidFile || '-');

  const running = state.status === 'running';
  const busy = state.status === 'starting' || state.status === 'stopping' || pendingAction;
  const managed = state.ownership === 'managed';
  const external = state.ownership === 'external';

  stateElements.startButton.disabled = busy || running || external;
  stateElements.stopButton.disabled = busy || !running || !managed;
  stateElements.openServiceButton.disabled = busy || !running;
  stateElements.openLogsButton.disabled = false;
  stateElements.quitButton.disabled = busy || external;
  stateElements.quitButton.textContent = external ? '외부 서버 실행 중' : '서버 중지 후 종료';
}

async function refreshLogs() {
  const payload = await window.controlAPI.readRecentLogs();
  stateElements.logOutput.textContent = payload.lines.join('\n');
  setText(
    stateElements.logFilePath,
    payload.filePath ? `현재 표시 중: ${payload.filePath}` : '아직 생성된 로그 파일이 없습니다.',
  );
}

async function syncState() {
  const state = await window.controlAPI.getServerStatus();
  renderState(state);
}

async function withAction(action) {
  pendingAction = true;
  try {
    const state = await action();
    if (state && typeof state === 'object' && 'status' in state) {
      renderState(state);
    } else {
      await syncState();
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : '제어 작업 중 오류가 발생했습니다.');
  } finally {
    pendingAction = false;
    await syncState();
    await refreshLogs();
  }
}

stateElements.startButton.addEventListener('click', () => withAction(() => window.controlAPI.startServer()));
stateElements.stopButton.addEventListener('click', () => withAction(() => window.controlAPI.stopServer()));
stateElements.openServiceButton.addEventListener('click', () => withAction(() => window.controlAPI.openService()));
stateElements.openLogsButton.addEventListener('click', () => withAction(() => window.controlAPI.openLogFile()));
stateElements.quitButton.addEventListener('click', () => withAction(() => window.controlAPI.quitControlApp()));

async function boot() {
  await syncState();
  await refreshLogs();

  window.setInterval(() => {
    void syncState();
    void refreshLogs();
  }, 2000);
}

void boot();
