/**
 * Electron Preload 스크립트
 *
 * contextBridge 를 통해 렌더러(React)에 안전하게 Electron API 를 노출한다.
 * nodeIntegration: false 환경에서 renderer 가 직접 ipcRenderer 에 접근할 수 없으므로
 * 이 스크립트를 통해서만 IPC 통신을 허용한다.
 *
 * 사용법 (React):
 *   window.electronAPI.quit()  → 앱 종료
 *   window.electronAPI.isElectron  → 전자 환경 여부 확인 (항상 true)
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 앱 종료 요청 — GlobalNav 종료 버튼에서 호출
  quit: () => ipcRenderer.send('app-quit'),

  // Electron 환경 여부 플래그 (React에서 종료 버튼 표시 조건)
  isElectron: true,
});
