const CHATGPT_CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses';
const CHATGPT_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_VERSION = '0.144.0';
const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_VERSION} (Windows 10; x86_64)`;
let requestFetch = globalThis.fetch;

function setCredentialFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') requestFetch = fetchImpl;
}

function classifyHttpStatus(status) {
  if (status >= 200 && status < 300) return 'alive';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  return 'server_error';
}

function resultForStatus(status) {
  return {
    status: classifyHttpStatus(status),
    detail: `HTTP ${status}`,
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeQuotaWindow(value) {
  if (!value || typeof value !== 'object') return undefined;
  const usedPercent = finiteNumber(value.used_percent ?? value.usedPercent);
  if (usedPercent === undefined) return undefined;
  const windowMinutes = finiteNumber(value.window_minutes ?? value.windowDurationMins)
    ?? (() => {
      const seconds = finiteNumber(value.limit_window_seconds);
      return seconds === undefined ? undefined : Math.round(seconds / 60);
    })();
  const resetsAt = finiteNumber(value.reset_at ?? value.resets_at ?? value.resetsAt)
    ?? (() => {
      const after = finiteNumber(value.reset_after_seconds);
      return after === undefined ? undefined : Math.floor(Date.now() / 1000 + after);
    })();
  return { usedPercent, windowMinutes, resetsAt };
}

function quotaFromPayload(data) {
  if (!data || typeof data !== 'object') return undefined;
  const rateLimit = data.rate_limit ?? data.rateLimits ?? data.rate_limits ?? data;
  if (!rateLimit || typeof rateLimit !== 'object') return undefined;
  const primary = normalizeQuotaWindow(rateLimit.primary_window ?? rateLimit.primary);
  const secondary = normalizeQuotaWindow(rateLimit.secondary_window ?? rateLimit.secondary);
  if (!primary && !secondary) return undefined;
  return { primary, secondary, checkedAt: Date.now() };
}

function quotaWindowFromHeaders(headers, prefix) {
  const usedPercent = finiteNumber(headers.get(`x-codex-${prefix}-used-percent`));
  if (usedPercent === undefined) return undefined;
  const window = {
    usedPercent,
    windowMinutes: finiteNumber(headers.get(`x-codex-${prefix}-window-minutes`)),
    resetsAt: finiteNumber(headers.get(`x-codex-${prefix}-reset-at`)),
  };
  if (window.usedPercent === 0 && !window.windowMinutes && !window.resetsAt) return undefined;
  return window;
}

function quotaFromHeaders(headers) {
  const primary = quotaWindowFromHeaders(headers, 'primary');
  const secondary = quotaWindowFromHeaders(headers, 'secondary');
  if (!primary && !secondary) return undefined;
  return { primary, secondary, checkedAt: Date.now() };
}

async function requestWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await requestFetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshOAuthCredential(refreshToken, clientId) {
  if (!refreshToken || !clientId) {
    return { ok: false, status: 'unauthorized', detail: '缺少可用的 refresh token 或 client_id' };
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    scope: 'openid profile email',
  });

  let response;
  try {
    response = await requestWithTimeout(OPENAI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }, 15_000);
  } catch (error) {
    return {
      ok: false,
      status: 'network_error',
      detail: error instanceof Error && error.name === 'AbortError' ? '刷新超时' : '刷新请求失败',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 400 || response.status === 401 ? 'unauthorized' : classifyHttpStatus(response.status),
      detail: `刷新失败 HTTP ${response.status}`,
    };
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.access_token !== 'string') {
    return { ok: false, status: 'server_error', detail: '刷新响应缺少 access token' };
  }

  return {
    ok: true,
    credential: data.access_token,
    refreshCredential: typeof data.refresh_token === 'string' && data.refresh_token
      ? data.refresh_token
      : refreshToken,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
}

async function probeOAuth(credential, accountId) {
  const headers = {
    Authorization: `Bearer ${credential}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental',
    Originator: 'codex_cli_rs',
    'User-Agent': CODEX_USER_AGENT,
    Version: CODEX_VERSION,
  };
  if (accountId) headers['chatgpt-account-id'] = accountId;

  const body = JSON.stringify({
    model: 'gpt-5.4',
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    instructions: 'Reply with OK.',
    stream: true,
    store: false,
  });

  try {
    const response = await requestWithTimeout(CHATGPT_CODEX_URL, {
      method: 'POST',
      headers,
      body,
    }, 30_000);
    const quota = response.ok ? quotaFromHeaders(response.headers) : undefined;
    if (response.body) await response.body.cancel().catch(() => undefined);
    return { ...resultForStatus(response.status), quota };
  } catch (error) {
    return {
      status: 'network_error',
      detail: error instanceof Error && error.name === 'AbortError' ? '请求超时' : '网络连接失败',
    };
  }
}

async function fetchOAuthQuota(credential, accountId) {
  const headers = {
    Authorization: `Bearer ${credential}`,
    Accept: 'application/json',
    'User-Agent': CODEX_USER_AGENT,
  };
  if (accountId) headers['chatgpt-account-id'] = accountId;

  try {
    const response = await requestWithTimeout(CHATGPT_USAGE_URL, { method: 'GET', headers }, 15_000);
    const result = resultForStatus(response.status);
    if (!response.ok) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      return result;
    }
    const data = await response.json().catch(() => null);
    return {
      ...result,
      quota: quotaFromPayload(data) ?? quotaFromHeaders(response.headers),
    };
  } catch (error) {
    return {
      status: 'network_error',
      detail: error instanceof Error && error.name === 'AbortError' ? '额度请求超时' : '额度请求失败',
    };
  }
}

async function validateOAuthCredential(input) {
  let credential = input.credential;
  let refreshCredential = input.refreshCredential;
  let expiresAt = input.expiresAt;
  let refreshed = false;

  if (expiresAt && expiresAt <= Date.now() + 30_000 && refreshCredential) {
    const refreshResult = await refreshOAuthCredential(refreshCredential, input.clientId);
    if (!refreshResult.ok) return refreshResult;
    credential = refreshResult.credential;
    refreshCredential = refreshResult.refreshCredential;
    expiresAt = refreshResult.expiresAt;
    refreshed = true;
  }

  let result = await probeOAuth(credential, input.accountId);
  if (result.status === 'unauthorized' && refreshCredential && !refreshed) {
    const refreshResult = await refreshOAuthCredential(refreshCredential, input.clientId);
    if (!refreshResult.ok) return refreshResult;
    credential = refreshResult.credential;
    refreshCredential = refreshResult.refreshCredential;
    expiresAt = refreshResult.expiresAt;
    result = await probeOAuth(credential, input.accountId);
    refreshed = true;
  }

  if (result.status === 'alive') {
    const quotaResult = await fetchOAuthQuota(credential, input.accountId);
    if (quotaResult.quota) result = { ...result, quota: quotaResult.quota };
  }

  return {
    ...result,
    credential: refreshed ? credential : undefined,
    refreshCredential: refreshed ? refreshCredential : undefined,
    expiresAt: refreshed ? expiresAt : undefined,
  };
}

async function validateApiKey(credential) {
  try {
    const response = await requestWithTimeout(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${credential}` },
    }, 12_000);
    if (response.body) await response.body.cancel().catch(() => undefined);
    return resultForStatus(response.status);
  } catch (error) {
    return {
      status: 'network_error',
      detail: error instanceof Error && error.name === 'AbortError' ? '请求超时' : '网络连接失败',
    };
  }
}

async function validateCredential(input) {
  if (!input || typeof input.credential !== 'string' || input.credential.length < 20 || input.credential.length > 16_384) {
    return { status: 'unauthorized', detail: '凭据格式无效' };
  }
  if (input.credentialKind === 'oauth') return validateOAuthCredential(input);
  if (input.credentialKind === 'api_key') return validateApiKey(input.credential);
  return { status: 'server_error', detail: '不支持的凭据类型' };
}

module.exports = {
  classifyHttpStatus,
  quotaFromPayload,
  setCredentialFetch,
  validateCredential,
};
