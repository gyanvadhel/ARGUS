/** Run `work` over `items` with at most `size` in flight. One failure never stops the rest. */
export async function runPool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift() as T;
      await work(item).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, worker));
}
