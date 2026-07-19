import type { AccountQuota } from '../lib/accounts';

export type HistoryType = 'validation' | 'gateway' | 'diagnostic';
export type HistoryOutcome = 'success' | 'attention' | 'failure';

export interface HistoryEvent {
  id: string;
  at: number;
  type: HistoryType;
  outcome: HistoryOutcome;
  fingerprint?: string;
  detail: string;
  elapsedMs?: number;
  quota?: AccountQuota;
}

export interface HistoryEventInput {
  at?: number;
  type: HistoryType;
  outcome: HistoryOutcome;
  fingerprint?: string;
  detail: string;
  elapsedMs?: number;
  quota?: AccountQuota;
  credential?: string;
  refreshCredential?: string;
  apiKey?: string;
  requestBody?: string;
}

export interface HistoryRetention {
  maxEntries: number;
  maxAgeDays: number;
  now?: number;
}

function redactDetail(detail: string, secrets: Array<string | undefined>): string {
  return secrets.reduce<string>((result, secret) => {
    if (!secret || secret.length < 3) return result;
    return result.replaceAll(secret, '[redacted]');
  }, detail);
}

export function toRedactedHistoryEvent(input: HistoryEventInput): HistoryEvent {
  const at = input.at ?? Date.now();
  return {
    id: `${at}-${input.type}-${input.outcome}-${input.fingerprint?.slice(0, 12) ?? 'system'}`,
    at,
    type: input.type,
    outcome: input.outcome,
    fingerprint: input.fingerprint,
    detail: redactDetail(input.detail, [input.credential, input.refreshCredential, input.apiKey, input.requestBody]),
    elapsedMs: input.elapsedMs,
    quota: input.quota,
  };
}

export function appendHistory(current: HistoryEvent[], event: HistoryEvent, retention: HistoryRetention): HistoryEvent[] {
  const now = retention.now ?? Date.now();
  const cutoff = now - retention.maxAgeDays * 24 * 60 * 60 * 1000;
  return [event, ...current]
    .filter((item) => item.at >= cutoff)
    .sort((left, right) => right.at - left.at)
    .slice(0, retention.maxEntries);
}

export function exportHistory(history: HistoryEvent[]) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    events: history.map(({ id, at, type, outcome, fingerprint, detail, elapsedMs, quota }) => ({
      id,
      at,
      type,
      outcome,
      fingerprint,
      detail,
      elapsedMs,
      quota,
    })),
  };
}
