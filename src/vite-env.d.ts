/// <reference types="vite/client" />

interface ImportedDocument {
  name: string;
  text?: string;
  error?: string;
}

interface FolderImportSelection {
  id: string;
  name: string;
  total: number;
}

interface FolderImportBatch {
  documents: ImportedDocument[];
  done: number;
  total: number;
  finished: boolean;
}

interface ValidationResult {
  status: 'alive' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'server_error' | 'network_error';
  detail: string;
  credential?: string;
  refreshCredential?: string;
  expiresAt?: number;
  quota?: {
    primary?: QuotaWindowSnapshot;
    secondary?: QuotaWindowSnapshot;
    checkedAt: number;
  };
}

interface QuotaWindowSnapshot {
  usedPercent: number;
  windowMinutes?: number;
  resetsAt?: number;
}

interface NetworkCheckResult {
  allowed: boolean;
  ip?: string;
  countryCode?: string;
  provider?: string;
  detail: string;
}

interface ValidationInput {
  credentialKind: 'oauth' | 'api_key';
  credential: string;
  refreshCredential?: string;
  clientId?: string;
  accountId?: string;
  expiresAt?: number;
}

interface Window {
  accountPulse?: {
    pickFiles: () => Promise<ImportedDocument[]>;
    pickFolder: () => Promise<FolderImportSelection | null>;
    readFolderBatch: (importId: string) => Promise<FolderImportBatch>;
    checkNetworkRegion: () => Promise<NetworkCheckResult>;
    openExternal: (url: string) => Promise<{ opened: boolean }> ;
    validateCredential: (input: ValidationInput) => Promise<ValidationResult>;
    saveReport: (content: string) => Promise<{ saved: boolean }>;
    saveJson: (content: string, suggestedName: string) => Promise<{ saved: boolean }>;
    loadWorkspace: () => Promise<{ available: boolean; workspace: unknown; error?: string }> ;
    saveWorkspace: (workspace: unknown) => Promise<{ saved: boolean; available: boolean }> ;
    clearWorkspace: () => Promise<{ cleared: boolean }> ;
  };
}
