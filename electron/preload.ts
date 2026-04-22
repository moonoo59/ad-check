import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('controlAPI', {
  getServerStatus: () => ipcRenderer.invoke('control:get-server-status'),
  startServer: () => ipcRenderer.invoke('control:start-server'),
  stopServer: () => ipcRenderer.invoke('control:stop-server'),
  openService: () => ipcRenderer.invoke('control:open-service'),
  openLogFile: () => ipcRenderer.invoke('control:open-log-file'),
  readRecentLogs: () => ipcRenderer.invoke('control:read-recent-logs'),
  quitControlApp: () => ipcRenderer.invoke('control:quit-app'),
});
