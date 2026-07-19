const { app, BrowserWindow, dialog, ipcMain, net, session, shell, safeStorage } = require('electron');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setCredentialFetch, validateCredential } = require('./credential-validator.cjs');
const { checkNetworkRegion, setNetworkFetch } = require('./network-check.cjs');
const { createWorkspaceVault } = require('./workspace-vault.cjs');

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FOLDER_FILES = 10_000;
const FOLDER_BATCH_SIZE = 25;
const folderImports = new Map();
const VAULT_FILE_NAME = 'encrypted-workspace.bin';

function vaultPath() {
  return path.join(app.getPath('userData'), VAULT_FILE_NAME);
}

async function readWorkspace() {
  return createWorkspaceVault({
    vaultPath: vaultPath(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
    available: () => safeStorage.isEncryptionAvailable(),
  }).read();
}

async function writeWorkspace(workspace) {
  return createWorkspaceVault({
    vaultPath: vaultPath(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
    available: () => safeStorage.isEncryptionAvailable(),
  }).write(workspace);
}

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'developers.openai.com',
  'github.com',
  'platform.openai.com',
]);

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#f4f6f7',
    autoHideMenuBar: true,
    title: 'Online testing account',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on('will-navigate', (event, url) => {
    const isDevelopmentPage = Boolean(process.env.VITE_DEV_SERVER_URL) && url === process.env.VITE_DEV_SERVER_URL;
    if (!isDevelopmentPage && !url.startsWith('file:')) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    window.loadURL(devUrl);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
        shell.openExternal(url);
      }
    } catch {
      // Ignore malformed external URLs.
    }
    return { action: 'deny' };
  });
}

async function readAccountDocument(filePath, displayName = path.basename(filePath)) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_IMPORT_FILE_BYTES) {
      return { name: displayName, error: '文件超过 10 MB' };
    }
    return {
      name: displayName,
      text: await fs.readFile(filePath, 'utf8'),
    };
  } catch (error) {
    return {
      name: displayName,
      error: error instanceof Error ? `读取失败：${error.message}` : '文件读取失败',
    };
  }
}

async function collectJsonFiles(rootPath) {
  const files = [];
  const pending = [rootPath];

  while (pending.length) {
    const directory = pending.pop();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') {
        files.push(entryPath);
        if (files.length > MAX_FOLDER_FILES) {
          throw new Error(`文件夹内 JSON 超过 ${MAX_FOLDER_FILES} 个，请拆分后导入`);
        }
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
}

ipcMain.handle('accounts:pick-files', async () => {
  const result = await dialog.showOpenDialog({
    title: '导入账号 JSON',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled) return [];

  return Promise.all(result.filePaths.map((filePath) => readAccountDocument(filePath)));
});

ipcMain.handle('accounts:pick-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: '导入账号文件夹',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) return null;

  const rootPath = result.filePaths[0];
  const files = await collectJsonFiles(rootPath);
  const id = randomUUID();
  folderImports.clear();
  folderImports.set(id, { rootPath, files, cursor: 0 });
  return { id, name: path.basename(rootPath), total: files.length };
});

ipcMain.handle('accounts:read-folder-batch', async (_event, importId) => {
  if (typeof importId !== 'string' || !folderImports.has(importId)) {
    throw new Error('文件夹导入任务已失效，请重新选择文件夹');
  }

  const session = folderImports.get(importId);
  const nextCursor = Math.min(session.cursor + FOLDER_BATCH_SIZE, session.files.length);
  const batchFiles = session.files.slice(session.cursor, nextCursor);
  const documents = await Promise.all(batchFiles.map((filePath) => readAccountDocument(
    filePath,
    path.relative(session.rootPath, filePath),
  )));
  session.cursor = nextCursor;
  const finished = nextCursor >= session.files.length;
  if (finished) folderImports.delete(importId);

  return {
    documents,
    done: nextCursor,
    total: session.files.length,
    finished,
  };
});

ipcMain.handle('accounts:validate-credential', async (_event, input) => validateCredential(input));
ipcMain.handle('network:check-region', async () => checkNetworkRegion());
ipcMain.handle('app:open-external', async (_event, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
      await shell.openExternal(parsed.toString());
      return { opened: true };
    }
  } catch {
    // Refuse malformed or unapproved destinations.
  }
  return { opened: false };
});
ipcMain.handle('workspace:load', async () => readWorkspace());
ipcMain.handle('workspace:save', async (_event, workspace) => writeWorkspace(workspace));
ipcMain.handle('workspace:clear', async () => {
  return createWorkspaceVault({
    vaultPath: vaultPath(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
    available: () => safeStorage.isEncryptionAvailable(),
  }).clear();
});

ipcMain.handle('accounts:save-report', async (_event, content) => {
  if (typeof content !== 'string' || content.length > 20 * 1024 * 1024) {
    return { saved: false };
  }
  const result = await dialog.showSaveDialog({
    title: '导出脱敏报告',
    defaultPath: `online-testing-account-report-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  await fs.writeFile(result.filePath, content, 'utf8');
  return { saved: true };
});

ipcMain.handle('accounts:save-json', async (_event, content, suggestedName) => {
  if (typeof content !== 'string' || content.length > 50 * 1024 * 1024) {
    return { saved: false };
  }
  const safeName = typeof suggestedName === 'string' && /^[\w\-. ]+\.json$/i.test(suggestedName)
    ? suggestedName
    : `online-testing-account-usable-${new Date().toISOString().slice(0, 10)}.json`;
  const result = await dialog.showSaveDialog({
    title: '导出剩余账号',
    defaultPath: safeName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  await fs.writeFile(result.filePath, content, 'utf8');
  return { saved: true };
});

app.whenReady().then(async () => {
  // Route main-process requests through the same Windows system proxy as the UI.
  await session.defaultSession.setProxy({ mode: 'system' }).catch(() => undefined);
  const proxiedFetch = (...args) => net.fetch(...args);
  setCredentialFetch(proxiedFetch);
  setNetworkFetch(proxiedFetch);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
