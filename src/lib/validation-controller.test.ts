import { describe, expect, it } from 'vitest';
import { ValidationController } from './validation-controller';

describe('ValidationController', () => {
  it('waits while paused and continues only after resume', async () => {
    const controller = new ValidationController();
    controller.pause();
    let settled = false;
    const permission = controller.waitForPermission().then((allowed) => {
      settled = true;
      return allowed;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    controller.resume();
    await expect(permission).resolves.toBe(true);
  });

  it('releases a paused runner with a stop signal when cancelled', async () => {
    const controller = new ValidationController();
    controller.pause();
    const permission = controller.waitForPermission();

    controller.cancel();

    await expect(permission).resolves.toBe(false);
    await expect(controller.waitForPermission()).resolves.toBe(false);
    expect(controller.isCancelled()).toBe(true);
  });

  it('can be reset for a new validation run', async () => {
    const controller = new ValidationController();
    controller.cancel();
    controller.reset();

    await expect(controller.waitForPermission()).resolves.toBe(true);
    expect(controller.isCancelled()).toBe(false);
  });
});
