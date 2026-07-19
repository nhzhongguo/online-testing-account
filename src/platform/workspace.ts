import { registerPlugin } from '@capacitor/core';

export type WorkspaceStorageMode = 'encrypted' | 'temporary';

export interface WorkspaceStorage<T> {
  mode: WorkspaceStorageMode;
  load(): Promise<T | undefined>;
  save(workspace: T): Promise<void>;
  clear(): Promise<void>;
}

interface SecureWorkspacePlugin {
  load(): Promise<{ available: boolean; workspace?: string }>;
  save(options: { workspace: string }): Promise<{ saved: boolean }>;
  clear(): Promise<void>;
}

export function createTemporaryWorkspaceStorage<T>(): WorkspaceStorage<T> {
  let workspace: T | undefined;

  return {
    mode: 'temporary',
    async load() {
      return workspace;
    },
    async save(nextWorkspace) {
      workspace = nextWorkspace;
    },
    async clear() {
      workspace = undefined;
    },
  };
}

function createElectronWorkspaceStorage<T>(bridge: NonNullable<Window['accountPulse']>): WorkspaceStorage<T> {
  return {
    mode: 'encrypted',
    async load() {
      const result = await bridge.loadWorkspace();
      return result.workspace as T | undefined;
    },
    async save(workspace) {
      const result = await bridge.saveWorkspace(workspace);
      if (!result.saved) throw new Error('Encrypted workspace could not be saved');
    },
    async clear() {
      await bridge.clearWorkspace();
    },
  };
}

function createAndroidWorkspaceStorage<T>(): WorkspaceStorage<T> {
  const secureWorkspace = registerPlugin<SecureWorkspacePlugin>('SecureWorkspace');

  return {
    mode: 'encrypted',
    async load() {
      const result = await secureWorkspace.load();
      if (!result.available || !result.workspace) return undefined;
      return JSON.parse(result.workspace) as T;
    },
    async save(workspace) {
      const result = await secureWorkspace.save({ workspace: JSON.stringify(workspace) });
      if (!result.saved) throw new Error('Secure workspace could not be saved');
    },
    async clear() {
      await secureWorkspace.clear();
    },
  };
}

export function createWorkspaceStorage<T>(isNativeMobile: boolean): WorkspaceStorage<T> {
  if (window.accountPulse) return createElectronWorkspaceStorage<T>(window.accountPulse);
  if (isNativeMobile) return createAndroidWorkspaceStorage<T>();
  return createTemporaryWorkspaceStorage<T>();
}
