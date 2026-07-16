export async function runSequentially<T>(items: readonly T[], task: (item: T, index: number) => Promise<void | boolean>) {
  for (let index = 0; index < items.length; index += 1) {
    const shouldContinue = await task(items[index], index);
    if (shouldContinue === false) return;
  }
}
