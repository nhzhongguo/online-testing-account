export async function runSequentially<T>(items: readonly T[], task: (item: T, index: number) => Promise<void>) {
  for (let index = 0; index < items.length; index += 1) {
    await task(items[index], index);
  }
}
