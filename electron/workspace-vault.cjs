const nodeFs = require('node:fs/promises');

function createWorkspaceVault({ vaultPath, encrypt, decrypt, available, fs = {} }) {
  const fileSystem = { ...nodeFs, ...fs };
  const temporaryPath = `${vaultPath}.tmp`;

  async function read() {
    if (!available()) return { available: false, workspace: null };
    try {
      const encrypted = await fileSystem.readFile(vaultPath);
      const workspace = JSON.parse(decrypt(encrypted));
      return { available: true, workspace: workspace && typeof workspace === 'object' ? workspace : null };
    } catch (error) {
      if (error && error.code === 'ENOENT') return { available: true, workspace: null };
      return { available: true, workspace: null, error: '无法读取已保存的本地工作区' };
    }
  }

  async function write(workspace) {
    if (!available()) return { saved: false, available: false };
    if (!workspace || typeof workspace !== 'object') return { saved: false, available: true };
    const content = JSON.stringify(workspace);
    if (content.length > 50 * 1024 * 1024) return { saved: false, available: true };

    const handle = await fileSystem.open(temporaryPath, 'w', 0o600);
    try {
      await handle.writeFile(encrypt(content));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fileSystem.rename(temporaryPath, vaultPath);
    } catch (error) {
      await fileSystem.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    return { saved: true, available: true };
  }

  async function clear() {
    try {
      await fileSystem.unlink(vaultPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
    return { cleared: true };
  }

  return { read, write, clear };
}

module.exports = { createWorkspaceVault };
