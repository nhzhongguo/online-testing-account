export type SourceFormat =
  | 'chatgpt-session'
  | '9router'
  | 'codex'
  | 'axonhub'
  | 'codex-manager'
  | 'cpa'
  | 'sub2api'
  | 'api-key'
  | 'unknown';

export type LocalStatus = 'current' | 'needs_refresh' | 'expired' | 'unknown';
export type OnlineStatus =
  | 'untested'
  | 'unsupported'
  | 'checking'
  | 'alive'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'server_error'
  | 'network_error';

export interface QuotaWindow {
  usedPercent: number;
  windowMinutes?: number;
  resetsAt?: number;
}

export interface AccountQuota {
  primary?: QuotaWindow;
  secondary?: QuotaWindow;
  checkedAt: number;
}

export interface AccountRecord {
  id: string;
  sourceName: string;
  sourcePath: string;
  format: SourceFormat;
  email: string;
  accountId?: string;
  plan?: string;
  credentialKind: 'oauth' | 'api_key';
  credential: string;
  refreshCredential?: string;
  clientId?: string;
  credentialPreview: string;
  fingerprint: string;
  hasRefreshToken: boolean;
  expiresAt?: number;
  localStatus: LocalStatus;
  localDetail: string;
  onlineStatus: OnlineStatus;
  onlineDetail?: string;
  checkedAt?: number;
  quota?: AccountQuota;
}

export interface ImportIssue {
  sourceName: string;
  path: string;
  reason: string;
}

export interface ImportResult {
  accounts: AccountRecord[];
  issues: ImportIssue[];
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function getObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function decodeJwtPayload(token: string): JsonObject | undefined {
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (/^\d+$/.test(value.trim())) return parseTimestamp(Number(value));
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function credentialFingerprint(value: string): string {
  const source = new TextEncoder().encode(value);
  const padded = new Uint8Array(Math.ceil((source.length + 9) / 64) * 64);
  padded.set(source);
  padded[source.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, source.length * 8, false);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 = ((previous15 >>> 7) | (previous15 << 25)) ^ ((previous15 >>> 18) | (previous15 << 14)) ^ (previous15 >>> 3);
      const sigma1 = ((previous2 >>> 17) | (previous2 << 15)) ^ ((previous2 >>> 19) | (previous2 << 13)) ^ (previous2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temporary1) >>> 0; d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('');
}

function previewCredential(value: string, kind: AccountRecord['credentialKind']): string {
  const tail = value.slice(-4).replace(/[^a-zA-Z0-9]/g, '*');
  return `${kind === 'api_key' ? 'API' : 'OAuth'} ••••${tail || '****'}`;
}

function detectFormat(record: JsonObject, parentFormat?: SourceFormat): SourceFormat {
  if (parentFormat === 'sub2api') return 'sub2api';
  if (getString(record.OPENAI_API_KEY, record.api_key, record.apiKey)) return 'api-key';
  if (record.auth_mode === 'chatgpt' && isObject(record.tokens)) {
    if ('axonhub_note' in record || 'axonhub_refresh_token_placeholder' in record) return 'axonhub';
    return 'codex';
  }
  if (isObject(record.tokens) && isObject(record.meta)) return 'codex-manager';
  if (getString(record.accessToken) && isObject(record.providerSpecificData)) return '9router';
  if (getString(record.accessToken) && (isObject(record.user) || isObject(record.account))) {
    return 'chatgpt-session';
  }
  if (getString(record.access_token) && (record.type === 'codex' || 'session_token' in record)) {
    return 'cpa';
  }
  return 'unknown';
}

function hasCredentialShape(record: JsonObject): boolean {
  const tokens = getObject(record.tokens);
  const credentials = getObject(record.credentials);
  return Boolean(getString(
    record.accessToken,
    record.access_token,
    record.id_token,
    record.idToken,
    record.OPENAI_API_KEY,
    record.api_key,
    record.apiKey,
    tokens.access_token,
    tokens.accessToken,
    tokens.id_token,
    tokens.idToken,
    credentials.access_token,
    credentials.accessToken,
    credentials.id_token,
    credentials.idToken,
  ));
}

interface Candidate {
  value: JsonObject;
  path: string;
  parentFormat?: SourceFormat;
}

function collectCandidates(value: unknown, path = '$', parentFormat?: SourceFormat): Candidate[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectCandidates(item, `${path}[${index}]`, parentFormat));
  }
  if (!isObject(value)) return [];

  if (hasCredentialShape(value)) return [{ value, path, parentFormat }];

  const nextParent = Array.isArray(value.accounts) ? 'sub2api' : parentFormat;
  const candidates: Candidate[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child) || isObject(child)) {
      candidates.push(...collectCandidates(child, `${path}.${key}`, nextParent));
    }
  }
  return candidates;
}

function createAccount(candidate: Candidate, sourceName: string, now: number): AccountRecord | undefined {
  const record = candidate.value;
  const tokens = getObject(record.tokens);
  const token = getObject(record.token);
  const credentials = getObject(record.credentials);
  const user = getObject(record.user);
  const account = getObject(record.account);
  const meta = getObject(record.meta);
  const provider = getObject(record.providerSpecificData);

  const apiKey = getString(record.OPENAI_API_KEY, record.api_key, record.apiKey);
  const accessToken = getString(
    record.accessToken,
    record.access_token,
    record.id_token,
    record.idToken,
    tokens.access_token,
    tokens.accessToken,
    tokens.id_token,
    tokens.idToken,
    token.access_token,
    token.accessToken,
    credentials.access_token,
    credentials.accessToken,
    credentials.id_token,
    credentials.idToken,
  );
  const credential = apiKey || accessToken;
  if (!credential) return undefined;

  const credentialKind = apiKey ? 'api_key' : 'oauth';
  const refreshToken = getString(
    record.refreshToken,
    record.refresh_token,
    tokens.refresh_token,
    tokens.refreshToken,
    token.refresh_token,
    token.refreshToken,
    credentials.refresh_token,
    credentials.refreshToken,
  );
  const clientId = getString(
    record.client_id,
    record.clientId,
    tokens.client_id,
    tokens.clientId,
    credentials.client_id,
    credentials.clientId,
  );
  const hasRefreshToken = Boolean(
    refreshToken
      && refreshToken !== '__missing_refresh_token__'
      && refreshToken !== 'null',
  );

  const payload = accessToken ? decodeJwtPayload(accessToken) : undefined;
  const authClaims = getObject(payload?.['https://api.openai.com/auth']);
  const profileClaims = getObject(payload?.['https://api.openai.com/profile']);
  const expiresAt = parseTimestamp(payload?.exp)
    ?? parseTimestamp(record.expiresAt)
    ?? parseTimestamp(record.expires_at)
    ?? parseTimestamp(record.expires)
    ?? parseTimestamp(record.expired)
    ?? parseTimestamp(tokens.expires_at)
    ?? parseTimestamp(credentials.expires_at);

  let localStatus: LocalStatus = 'unknown';
  let localDetail = '缺少可核对的过期时间';
  if (credentialKind === 'api_key') {
    localDetail = 'API Key 需要在线验证';
  } else if (expiresAt && expiresAt <= now) {
    if (hasRefreshToken) {
      localStatus = 'needs_refresh';
      localDetail = '访问令牌已过期，存在 refresh token';
    } else {
      localStatus = 'expired';
      localDetail = '访问令牌已过期且无法刷新';
    }
  } else if (expiresAt) {
    localStatus = 'current';
    localDetail = '访问令牌尚未过期';
  }

  const email = getString(
    record.email,
    credentials.email,
    record.name,
    user.email,
    account.email,
    meta.label,
    profileClaims.email,
    payload?.email,
  ) || '未识别邮箱';
  const accountId = getString(
    record.account_id,
    record.accountId,
    tokens.account_id,
    tokens.chatgpt_account_id,
    credentials.account_id,
    credentials.chatgpt_account_id,
    account.id,
    provider.chatgptAccountId,
    meta.chatgpt_account_id,
    authClaims.chatgpt_account_id,
  );
  const plan = getString(
    record.plan_type,
    record.planType,
    account.planType,
    credentials.plan_type,
    credentials.planType,
    provider.chatgptPlanType,
    authClaims.chatgpt_plan_type,
  );
  const fingerprint = credentialFingerprint(credential);

  return {
    id: fingerprint + '-' + credentialFingerprint(sourceName + ':' + candidate.path).slice(0, 12),
    sourceName,
    sourcePath: candidate.path,
    format: detectFormat(record, candidate.parentFormat),
    email,
    accountId,
    plan,
    credentialKind,
    credential,
    refreshCredential: hasRefreshToken ? refreshToken : undefined,
    clientId,
    credentialPreview: previewCredential(credential, credentialKind),
    fingerprint,
    hasRefreshToken,
    expiresAt,
    localStatus,
    localDetail,
    onlineStatus: 'untested',
    onlineDetail: undefined,
  };
}

export function importAccountText(text: string, sourceName: string, now = Date.now()): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      accounts: [],
      issues: [{ sourceName, path: '$', reason: 'JSON 解析失败' }],
    };
  }

  const candidates = collectCandidates(parsed);
  if (!candidates.length) {
    return {
      accounts: [],
      issues: [{ sourceName, path: '$', reason: '未找到受支持的账号凭据' }],
    };
  }

  const accounts: AccountRecord[] = [];
  const issues: ImportIssue[] = [];
  for (const candidate of candidates) {
    const account = createAccount(candidate, sourceName, now);
    if (account) accounts.push(account);
    else issues.push({ sourceName, path: candidate.path, reason: '缺少访问凭据' });
  }
  return { accounts, issues };
}

export function mergeAccounts(current: AccountRecord[], incoming: AccountRecord[]): AccountRecord[] {
  const byFingerprint = new Map(current.map((account) => [account.fingerprint, account]));
  for (const account of incoming) {
    const existing = byFingerprint.get(account.fingerprint);
    if (!existing) {
      byFingerprint.set(account.fingerprint, account);
      continue;
    }

    const hasRefreshToken = existing.hasRefreshToken || account.hasRefreshToken;
    const expiredWithRefresh = account.localStatus === 'expired' && hasRefreshToken;
    byFingerprint.set(account.fingerprint, {
      ...existing,
      ...account,
      id: existing.id,
      email: account.email === '未识别邮箱' ? existing.email : account.email,
      accountId: account.accountId || existing.accountId,
      plan: account.plan || existing.plan,
      format: account.format === 'unknown' ? existing.format : account.format,
      hasRefreshToken,
      refreshCredential: account.refreshCredential || existing.refreshCredential,
      clientId: account.clientId || existing.clientId,
      localStatus: expiredWithRefresh ? 'needs_refresh' : account.localStatus,
      localDetail: expiredWithRefresh ? '访问令牌已过期，存在 refresh token' : account.localDetail,
      onlineStatus: account.onlineStatus === 'untested' ? existing.onlineStatus : account.onlineStatus,
      onlineDetail: account.onlineStatus === 'untested' ? existing.onlineDetail : account.onlineDetail,
      checkedAt: account.checkedAt || existing.checkedAt,
      quota: account.quota || existing.quota,
    });
  }
  return [...byFingerprint.values()];
}

export function createRedactedReport(accounts: AccountRecord[], issues: ImportIssue[]) {
  return {
    generated_at: new Date().toISOString(),
    summary: {
      imported: accounts.length,
      locally_current: accounts.filter((item) => item.localStatus === 'current').length,
      expired: accounts.filter((item) => item.localStatus === 'expired').length,
      needs_refresh: accounts.filter((item) => item.localStatus === 'needs_refresh').length,
      online_alive: accounts.filter((item) => item.onlineStatus === 'alive').length,
      online_tested: accounts.filter((item) => !['untested', 'unsupported', 'checking'].includes(item.onlineStatus)).length,
      import_issues: issues.length,
    },
    accounts: accounts.map(({ credential: _credential, refreshCredential: _refreshCredential, ...account }) => account),
    issues,
  };
}

function withoutUndefined(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== ''));
}

export function createSub2ApiExport(accounts: AccountRecord[]) {
  const retained = accounts.filter((account) => account.onlineStatus !== 'unauthorized');
  return {
    exported_at: new Date().toISOString(),
    proxies: [],
    accounts: retained.map((account) => {
      const expiresAt = account.expiresAt ? Math.floor(account.expiresAt / 1000) : undefined;
      const credentials = account.credentialKind === 'api_key'
        ? withoutUndefined({
            api_key: account.credential,
            email: account.email === '未识别邮箱' ? undefined : account.email,
          })
        : withoutUndefined({
            access_token: account.credential,
            refresh_token: account.refreshCredential,
            client_id: account.clientId,
            account_id: account.accountId,
            email: account.email === '未识别邮箱' ? undefined : account.email,
            plan_type: account.plan,
            expires_at: expiresAt,
          });

      return withoutUndefined({
        name: account.email === '未识别邮箱' ? `account-${account.fingerprint}` : account.email,
        platform: 'openai',
        type: account.credentialKind === 'api_key' ? 'apikey' : 'oauth',
        expires_at: expiresAt,
        auto_pause_on_expired: Boolean(expiresAt),
        concurrency: 10,
        priority: 1,
        rate_multiplier: 1,
        credentials,
        extra: withoutUndefined({
          source: 'online_testing_account',
          validation_status: account.onlineStatus,
          validation_checked_at: account.checkedAt ? new Date(account.checkedAt).toISOString() : undefined,
        }),
      });
    }),
  };
}

export function formatExpiry(expiresAt?: number): string {
  if (!expiresAt) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(expiresAt);
}
