import { describe, expect, it } from 'vitest';
import { createTemporaryWorkspaceStorage } from './workspace';

describe('temporary workspace storage', () => {
  it('keeps credential-bearing workspaces in memory only', async () => {
    const storage = createTemporaryWorkspaceStorage<{ credential: string }>();

    await storage.save({ credential: 'secret-token' });

    expect(storage.mode).toBe('temporary');
    await expect(storage.load()).resolves.toEqual({ credential: 'secret-token' });
  });

  it('clears temporary workspaces without a browser persistence dependency', async () => {
    const storage = createTemporaryWorkspaceStorage<{ credential: string }>();
    await storage.save({ credential: 'secret-token' });

    await storage.clear();

    await expect(storage.load()).resolves.toBeUndefined();
  });
});
