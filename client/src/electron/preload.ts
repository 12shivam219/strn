import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  toggleStream: () => ipcRenderer.invoke('toggle-stream')
});
