import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { createRedactedReport, createSub2ApiExport, credentialFingerprint, importAccountText, mergeAccounts } from './accounts';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
}

describe('account imports', () => {
  const now = Date.parse('2026-07-16T00:00:00.000Z');

  it('uses a SHA-256 fingerprint for credential identity', () => {
    expect(credentialFingerprint('collision-2rnw')).toBe('cd066c6f94e9d583ee06c538cd8ed7ed97a8fcd2f0f9bb5e8c01019b0927d4ae');
  });

  it('parses ChatGPT session metadata and JWT expiry', () => {
    const result = importAccountText(JSON.stringify({
      user: { email: 'user@example.com' },
      accessToken: jwt({ exp: Math.floor(now / 1000) + 3600 }),
      sessionToken: 'session',
      account: { id: 'account-1', planType: 'plus' },
    }), 'session.json', now);

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      email: 'user@example.com',
      format: 'chatgpt-session',
      accountId: 'account-1',
      plan: 'plus',
      localStatus: 'current',
      onlineStatus: 'untested',
    });
  });

  it('marks expired access-only sessions as expired', () => {
    const result = importAccountText(JSON.stringify({
      email: 'old@example.com',
      accessToken: jwt({ exp: Math.floor(now / 1000) - 60 }),
    }), 'expired.json', now);
    expect(result.accounts[0].localStatus).toBe('expired');
  });

  it('marks expired Codex credentials with refresh token as refreshable candidates', () => {
    const result = importAccountText(JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: {
        access_token: jwt({ exp: Math.floor(now / 1000) - 60 }),
        refresh_token: 'refresh-token',
        account_id: 'account-2',
      },
    }), 'auth.json', now);
    expect(result.accounts[0]).toMatchObject({
      format: 'codex',
      localStatus: 'needs_refresh',
      hasRefreshToken: true,
    });
  });

  it('parses sub2api account arrays', () => {
    const result = importAccountText(JSON.stringify({
      proxies: [],
      accounts: [{
        name: 'sub2api-account',
        credentials: {
          access_token: 'opaque-token',
          refresh_token: 'refresh-token',
          client_id: 'client-id',
          email: 'sub@example.com',
          account_id: 'sub-account-id',
          plan_type: 'team',
        },
        expires_at: Math.floor(now / 1000) + 300,
      }],
    }), 'sub2api.json', now);
    expect(result.accounts[0]).toMatchObject({
      format: 'sub2api',
      email: 'sub@example.com',
      accountId: 'sub-account-id',
      plan: 'team',
      hasRefreshToken: true,
      localStatus: 'current',
      clientId: 'client-id',
    });
  });

  it('imports c2api3 sub2api credentials that use id_token', () => {
    const result = importAccountText(JSON.stringify({
      type: 'c2api3',
      version: 1,
      accounts: [{
        name: 'c2api3-account',
        platform: 'openai',
        credentials: {
          id_token: jwt({ sub: 'user-1', email: 'c2@example.com' }),
          account_id: 'account-c2',
          chatgpt_account_id: 'account-c2',
          email: 'c2@example.com',
          plan_type: 'pro',
          auth_mode: 'chatgpt',
        },
      }],
    }), 'c2api3.json', now);

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      format: 'sub2api',
      credentialKind: 'oauth',
      email: 'c2@example.com',
      accountId: 'account-c2',
    });
  });

  it('allows standard API keys to be online-tested', () => {
    const result = importAccountText(JSON.stringify({ OPENAI_API_KEY: 'sk-example-key-value-123456789' }), 'key.json', now);
    expect(result.accounts[0]).toMatchObject({
      credentialKind: 'api_key',
      onlineStatus: 'untested',
    });
  });

  it('deduplicates matching credentials and strips them from reports', () => {
    const first = importAccountText(JSON.stringify({ access_token: 'same-token', email: 'a@example.com' }), 'a.json', now).accounts;
    const second = importAccountText(JSON.stringify({ access_token: 'same-token', email: 'b@example.com' }), 'b.json', now).accounts;
    const merged = mergeAccounts(first, second);
    const report = JSON.stringify(createRedactedReport(merged, []));

    expect(merged).toHaveLength(1);
    expect(merged[0].email).toBe('b@example.com');
    expect(report).not.toContain('same-token');
    expect(report).not.toContain('real-refresh-token');
  });

  it('does not merge credentials that share the old 32-bit hash collision', async () => {
    const first = importAccountText(JSON.stringify({ access_token: 'collision-2rnw' }), 'first.json', now).accounts;
    const second = importAccountText(JSON.stringify({ access_token: 'collision-jpba' }), 'second.json', now).accounts;

    expect((await mergeAccounts(first, second))).toHaveLength(2);
  });

  it('does not erase a verified quota when an import has no quota data', async () => {
    const verified = importAccountText(JSON.stringify({ access_token: 'verified-token', email: 'verified@example.com' }), 'verified.json', now).accounts;
    verified[0].onlineStatus = 'alive';
    verified[0].quota = { primary: { usedPercent: 18, windowMinutes: 300 }, checkedAt: now };
    const sparseDuplicate = importAccountText(JSON.stringify({ access_token: 'verified-token' }), 'sparse.json', now).accounts;

    const merged = await mergeAccounts(verified, sparseDuplicate);

    expect(merged[0]).toMatchObject({ onlineStatus: 'alive', quota: verified[0].quota });
  });

  it('preserves refresh capability when duplicate records are merged', () => {
    const withRefresh = importAccountText(JSON.stringify({
      access_token: jwt({ exp: Math.floor(now / 1000) - 60 }),
      refresh_token: 'real-refresh-token',
    }), 'refresh.json', now).accounts;
    const withoutRefresh = importAccountText(JSON.stringify({
      access_token: jwt({ exp: Math.floor(now / 1000) - 60 }),
      email: 'resolved@example.com',
    }), 'profile.json', now).accounts;

    const merged = mergeAccounts(withRefresh, withoutRefresh);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      email: 'resolved@example.com',
      hasRefreshToken: true,
      localStatus: 'needs_refresh',
    });
  });

  it('exports every account except credential failures in sub2api format', () => {
    const source = importAccountText(JSON.stringify([
      { access_token: 'alive-access-token-1234567890', refresh_token: 'alive-refresh-token', email: 'alive@example.com' },
      { access_token: 'limited-access-token-1234567890', refresh_token: 'limited-refresh-token', email: 'limited@example.com' },
      { access_token: 'failed-access-token-1234567890', refresh_token: 'failed-refresh-token', email: 'failed@example.com' },
    ]), 'mixed.json', now).accounts;
    source[0].onlineStatus = 'alive';
    source[1].onlineStatus = 'rate_limited';
    source[2].onlineStatus = 'unauthorized';

    const exported = createSub2ApiExport(source);
    const serialized = JSON.stringify(exported);

    expect(exported.accounts).toHaveLength(2);
    expect(serialized).toContain('alive-access-token');
    expect(serialized).toContain('limited-access-token');
    expect(serialized).not.toContain('failed-access-token');
    expect(exported.accounts[0]).toMatchObject({ platform: 'openai', type: 'oauth' });
  });
});
