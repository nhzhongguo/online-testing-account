import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { quotaFromPayload } = require('../../electron/credential-validator.cjs') as {
  quotaFromPayload: (payload: unknown) => {
    primary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number };
    secondary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number };
  } | undefined;
};

describe('Codex quota parsing', () => {
  it('maps the five-hour and weekly windows from the WHAM payload', () => {
    const quota = quotaFromPayload({
      rate_limit: {
        primary_window: {
          used_percent: 12,
          limit_window_seconds: 18_000,
          reset_at: 1_800_000_000,
        },
        secondary_window: {
          used_percent: 45,
          limit_window_seconds: 604_800,
          reset_at: 1_800_500_000,
        },
      },
    });

    expect(quota?.primary).toEqual({
      usedPercent: 12,
      windowMinutes: 300,
      resetsAt: 1_800_000_000,
    });
    expect(quota?.secondary).toEqual({
      usedPercent: 45,
      windowMinutes: 10_080,
      resetsAt: 1_800_500_000,
    });
  });
});
