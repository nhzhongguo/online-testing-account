export class ValidationController {
  private paused = false;
  private cancelled = false;
  private waiter?: (canContinue: boolean) => void;

  reset() {
    this.release(false);
    this.paused = false;
    this.cancelled = false;
  }

  pause() {
    if (!this.cancelled) this.paused = true;
  }

  resume() {
    if (this.cancelled) return;
    this.paused = false;
    this.release(true);
  }

  cancel() {
    this.cancelled = true;
    this.paused = false;
    this.release(false);
  }

  isCancelled() {
    return this.cancelled;
  }

  async waitForPermission(): Promise<boolean> {
    if (this.cancelled) return false;
    if (!this.paused) return true;
    return new Promise<boolean>((resolve) => {
      this.waiter = resolve;
    });
  }

  private release(canContinue: boolean) {
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.(canContinue);
  }
}
