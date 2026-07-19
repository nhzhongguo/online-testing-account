import { describe, expect, it } from 'vitest';
import { appendHistory, exportHistory, toRedactedHistoryEvent } from './history';

describe('redacted history', () => {
  it('drops secrets and limits the retained history window', () => {
    const now = Date.parse('2026-07-19T00:00:00.000Z');
    const event = toRedactedHistoryEvent({
      at: now,
      type: 'validation',
      outcome: 'success',
      fingerprint: 'a'.repeat(64),
      detail: 'Validated credential secret-access with refresh-token and provider-key',
      credential: 'secret-access',
      refreshCredential: 'refresh-token',
      apiKey: 'provider-key',
      requestBody: '{"authorization":"secret-access"}',
    });
    const stale = toRedactedHistoryEvent({ at: now - 31 * 24 * 60 * 60 * 1000, type: 'diagnostic', outcome: 'failure', detail: 'Old failure' });

    const history = appendHistory([stale], event, { maxEntries: 2, maxAgeDays: 30, now });
    const serialized = JSON.stringify(exportHistory(history));

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: 'validation', fingerprint: 'a'.repeat(64), detail: expect.stringContaining('[redacted]') });
    expect(serialized).not.toContain('secret-access');
    expect(serialized).not.toContain('refresh-token');
    expect(serialized).not.toContain('provider-key');
  });

  it('keeps newest events first and enforces the configured entry count', () => {
    const history = appendHistory([
      toRedactedHistoryEvent({ at: 2, type: 'gateway', outcome: 'attention', detail: 'Second' }),
      toRedactedHistoryEvent({ at: 1, type: 'gateway', outcome: 'success', detail: 'First' }),
    ], toRedactedHistoryEvent({ at: 3, type: 'validation', outcome: 'failure', detail: 'Third' }), { maxEntries: 2, maxAgeDays: 365, now: 10 });

    expect(history.map((event) => event.detail)).toEqual(['Third', 'Second']);
  });
});
