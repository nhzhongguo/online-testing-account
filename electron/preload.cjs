const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accountPulse', {
  pickFiles: () => ipcRenderer.invoke('accounts:pick-files'),
  pickFolder: () => ipcRenderer.invoke('accounts:pick-folder'),
  readFolderBatch: (importId) => ipcRenderer.invoke('accounts:read-folder-batch', importId),
  checkNetworkRegion: () => ipcRenderer.invoke('network:check-region'),
  validateCredential: (input) => ipcRenderer.invoke('accounts:validate-credential', input),
  saveReport: (content) => ipcRenderer.invoke('accounts:save-report', content),
  saveJson: (content, suggestedName) => ipcRenderer.invoke('accounts:save-json', content, suggestedName),
});
