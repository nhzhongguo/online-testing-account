import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorkspaceVault } from '../../electron/workspace-vault.cjs';

describe('electron workspace vault', () => {
  it('keeps the last valid encrypted workspace when replacement fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'account-pulse-vault-'));
    const vaultPath = join(directory, 'workspace.bin');
    const encrypt = (value: string) => Buffer.from(`encrypted:${value}`);
    const decrypt = (value: Buffer) => value.toString().replace(/^encrypted:/, '');
    const vault = createWorkspaceVault({ vaultPath, encrypt, decrypt, available: () => true });

    try {
      await vault.write({ accounts: [{ id: 'previous' }] });
      const failingVault = createWorkspaceVault({
        vaultPath,
        encrypt,
        decrypt,
        available: () => true,
        fs: { rename: async () => { throw new Error('rename failed'); } },
      });

      await expect(failingVault.write({ accounts: [{ id: 'next' }] })).rejects.toThrow('rename failed');
      await expect(vault.read()).resolves.toMatchObject({ workspace: { accounts: [{ id: 'previous' }] } });
      await expect(readFile(vaultPath)).resolves.toEqual(encrypt(JSON.stringify({ accounts: [{ id: 'previous' }] })));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
