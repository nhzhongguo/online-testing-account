import { Capacitor, CapacitorHttp, type HttpHeaders, type HttpResponse } from '@capacitor/core';

const CHATGPT_CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses';
const CHATGPT_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_VERSION = '0.144.0';
const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_VERSION} (Android; arm64)`;

type ClassifiedStatus = ValidationResult['status'];

export function isNativeMobile() {
  return Capacitor.isNativePlatform();
}

function classifyHttpStatus(status: number): ClassifiedStatus {
  if (status >= 200 && status < 300) return 'alive';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  return 'server_error';
}

function resultForResponse(response: HttpResponse): ValidationResult {
  return { status: classifyHttpStatus(response.status), detail: `HTTP ${response.status}` };
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function headerValue(headers: HttpHeaders, name: string) {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

function normalizeQuotaWindow(value: unknown): QuotaWindowSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const usedPercent = finiteNumber(data.used_percent ?? data.usedPercent);
  if (usedPercent === undefined) return undefined;
  const seconds = finiteNumber(data.limit_window_seconds);
  const resetAfter = finiteNumber(data.reset_after_seconds);
  return {
    usedPercent,
    windowMinutes: finiteNumber(data.window_minutes ?? data.windowDurationMins)
      ?? (seconds === undefined ? undefined : Math.round(seconds / 60)),
    resetsAt: finiteNumber(data.reset_at ?? data.resets_at ?? data.resetsAt)
      ?? (resetAfter === undefined ? undefined : Math.floor(Date.now() / 1000 + resetAfter)),
  };
}

function quotaFromPayload(value: unknown): ValidationResult['quota'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const rateLimit = (data.rate_limit ?? data.rateLimits ?? data.rate_limits ?? data) as Record<string, unknown>;
  const primary = normalizeQuotaWindow(rateLimit.primary_window ?? rateLimit.primary);
  const secondary = normalizeQuotaWindow(rateLimit.secondary_window ?? rateLimit.secondary);
  if (!primary && !secondary) return undefined;
  return { primary, secondary, checkedAt: Date.now() };
}

function quotaWindowFromHeaders(headers: HttpHeaders, prefix: string): QuotaWindowSnapshot | undefined {
  const usedPercent = finiteNumber(headerValue(headers, `x-codex-${prefix}-used-percent`));
  if (usedPercent === undefined) return undefined;
  const result = {
    usedPercent,
    windowMinutes: finiteNumber(headerValue(headers, `x-codex-${prefix}-window-minutes`)),
    resetsAt: finiteNumber(headerValue(headers, `x-codex-${prefix}-reset-at`)),
  };
  if (result.usedPercent === 0 && !result.windowMinutes && !result.resetsAt) return undefined;
  return result;
}

function quotaFromHeaders(headers: HttpHeaders): ValidationResult['quota'] | undefined {
  const primary = quotaWindowFromHeaders(headers, 'primary');
  const secondary = quotaWindowFromHeaders(headers, 'secondary');
  if (!primary && !secondary) return undefined;
  return { primary, secondary, checkedAt: Date.now() };
}

function networkFailure(error: unknown, timeoutDetail: string, failureDetail: string): ValidationResult {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return { status: 'network_error', detail: message.includes('timeout') ? timeoutDetail : failureDetail };
}

async function refreshOAuthCredential(refreshToken?: string, clientId?: string) {
  if (!refreshToken || !clientId) {
    return { ok: false as const, result: { status: 'unauthorized', detail: 'Missing refresh token or client_id' } as ValidationResult };
  }

  try {
    const response = await CapacitorHttp.post({
      url: OPENAI_TOKEN_URL,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        scope: 'openid profile email',
      }).toString(),
      connectTimeout: 15_000,
      readTimeout: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false as const,
        result: {
          status: response.status === 400 || response.status === 401 ? 'unauthorized' : classifyHttpStatus(response.status),
          detail: `Refresh failed: HTTP ${response.status}`,
        } as ValidationResult,
      };
    }
    const data = response.data as Record<string, unknown> | null;
    if (!data || typeof data.access_token !== 'string') {
      return { ok: false as const, result: { status: 'server_error', detail: 'Refresh response has no access token' } as ValidationResult };
    }
    return {
      ok: true as const,
      credential: data.access_token,
      refreshCredential: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : refreshToken,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    };
  } catch (error) {
    return { ok: false as const, result: networkFailure(error, 'Refresh timed out', 'Refresh request failed') };
  }
}

async function probeOAuth(credential: string, accountId?: string): Promise<ValidationResult> {
  const headers: HttpHeaders = {
    Authorization: `Bearer ${credential}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental',
    Originator: 'codex_cli_rs',
    'User-Agent': CODEX_USER_AGENT,
    Version: CODEX_VERSION,
  };
  if (accountId) headers['chatgpt-account-id'] = accountId;

  try {
    const response = await CapacitorHttp.post({
      url: CHATGPT_CODEX_URL,
      headers,
      data: {
        model: 'gpt-5.4',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        instructions: 'Reply with OK.',
        stream: true,
        store: false,
      },
      connectTimeout: 20_000,
      readTimeout: 30_000,
      responseType: 'text',
    });
    const result = resultForResponse(response);
    return response.status >= 200 && response.status < 300
      ? { ...result, quota: quotaFromHeaders(response.headers) }
      : result;
  } catch (error) {
    return networkFailure(error, 'Request timed out', 'Network connection failed');
  }
}

async function fetchOAuthQuota(credential: string, accountId?: string): Promise<ValidationResult> {
  const headers: HttpHeaders = { Authorization: `Bearer ${credential}`, Accept: 'application/json', 'User-Agent': CODEX_USER_AGENT };
  if (accountId) headers['chatgpt-account-id'] = accountId;
  try {
    const response = await CapacitorHttp.get({
      url: CHATGPT_USAGE_URL,
      headers,
      connectTimeout: 15_000,
      readTimeout: 15_000,
    });
    const result = resultForResponse(response);
    return response.status >= 200 && response.status < 300
      ? { ...result, quota: quotaFromPayload(response.data) ?? quotaFromHeaders(response.headers) }
      : result;
  } catch (error) {
    return networkFailure(error, 'Quota request timed out', 'Quota request failed');
  }
}

async function validateOAuthCredential(input: ValidationInput): Promise<ValidationResult> {
  let credential = input.credential;
  let refreshCredential = input.refreshCredential;
  let expiresAt = input.expiresAt;
  let refreshed = false;

  if (expiresAt && expiresAt <= Date.now() + 30_000 && refreshCredential) {
    const refresh = await refreshOAuthCredential(refreshCredential, input.clientId);
    if (!refresh.ok) return refresh.result;
    credential = refresh.credential;
    refreshCredential = refresh.refreshCredential;
    expiresAt = refresh.expiresAt;
    refreshed = true;
  }

  let result = await probeOAuth(credential, input.accountId);
  if (result.status === 'unauthorized' && refreshCredential && !refreshed) {
    const refresh = await refreshOAuthCredential(refreshCredential, input.clientId);
    if (!refresh.ok) return refresh.result;
    credential = refresh.credential;
    refreshCredential = refresh.refreshCredential;
    expiresAt = refresh.expiresAt;
    result = await probeOAuth(credential, input.accountId);
    refreshed = true;
  }

  if (result.status === 'alive') {
    const quota = await fetchOAuthQuota(credential, input.accountId);
    if (quota.quota) result = { ...result, quota: quota.quota };
  }

  return {
    ...result,
    credential: refreshed ? credential : undefined,
    refreshCredential: refreshed ? refreshCredential : undefined,
    expiresAt: refreshed ? expiresAt : undefined,
  };
}

async function validateApiKey(credential: string): Promise<ValidationResult> {
  try {
    const response = await CapacitorHttp.get({
      url: OPENAI_MODELS_URL,
      headers: { Authorization: `Bearer ${credential}` },
      connectTimeout: 12_000,
      readTimeout: 12_000,
    });
    return resultForResponse(response);
  } catch (error) {
    return networkFailure(error, 'Request timed out', 'Network connection failed');
  }
}

export async function validateCredentialMobile(input: ValidationInput): Promise<ValidationResult> {
  if (!input || typeof input.credential !== 'string' || input.credential.length < 20 || input.credential.length > 16_384) {
    return { status: 'unauthorized', detail: 'Invalid credential format' };
  }
  if (input.credentialKind === 'oauth') return validateOAuthCredential(input);
  if (input.credentialKind === 'api_key') return validateApiKey(input.credential);
  return { status: 'server_error', detail: 'Unsupported credential type' };
}

function createNetworkResult(ip: unknown, countryCode: unknown, provider: string): NetworkCheckResult {
  const normalizedCountry = String(countryCode || '').trim().toUpperCase();
  if (!normalizedCountry) throw new Error('IP service returned no country code');
  const countryKnown = /^[A-Z]{2}$/.test(normalizedCountry) && normalizedCountry !== 'XX';
  return {
    allowed: countryKnown && normalizedCountry !== 'CN',
    ip: String(ip || '').trim(),
    countryCode: normalizedCountry,
    provider,
    detail: !countryKnown
      ? 'Unable to identify the exit country; validation is blocked'
      : normalizedCountry === 'CN'
        ? 'Mainland China exit detected; enable a foreign proxy and check again'
        : `Exit country ${normalizedCountry}; online validation is available`,
  };
}

export async function checkNetworkRegionMobile(): Promise<NetworkCheckResult> {
  try {
    const response = await CapacitorHttp.get({
      url: 'https://www.cloudflare.com/cdn-cgi/trace',
      headers: { 'User-Agent': 'Online-testing-account/0.8.1' },
      responseType: 'text',
      connectTimeout: 10_000,
      readTimeout: 10_000,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`Cloudflare HTTP ${response.status}`);
    const entries = Object.fromEntries(String(response.data)
      .split('\n')
      .map((line) => line.trim().split('='))
      .filter((parts) => parts.length === 2));
    return createNetworkResult(entries.ip, entries.loc, 'Cloudflare');
  } catch {
    try {
      const response = await CapacitorHttp.get({
        url: 'https://api.country.is/',
        headers: { 'User-Agent': 'Online-testing-account/0.8.1' },
        connectTimeout: 10_000,
        readTimeout: 10_000,
      });
      if (response.status < 200 || response.status >= 300) throw new Error(`country.is HTTP ${response.status}`);
      const data = response.data as Record<string, unknown>;
      return createNetworkResult(data.ip, data.country, 'country.is');
    } catch {
      return { allowed: false, detail: 'Unable to detect the exit IP; check the network and enable a foreign proxy' };
    }
  }
}
