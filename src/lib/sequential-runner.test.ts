import { describe, expect, it } from 'vitest';
import { runSequentially } from './sequential-runner';

describe('runSequentially', () => {
  it('never runs more than one task at a time and preserves order', async () => {
    let active = 0;
    let maxActive = 0;
    const completed: number[] = [];

    await runSequentially([1, 2, 3, 4], async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      completed.push(item);
      active -= 1;
    });

    expect(maxActive).toBe(1);
    expect(completed).toEqual([1, 2, 3, 4]);
  });

  it('stops before the next item when a task returns false', async () => {
    const started: number[] = [];

    await runSequentially([1, 2, 3, 4], async (item) => {
      started.push(item);
      return item < 2;
    });

    expect(started).toEqual([1, 2]);
  });
});
