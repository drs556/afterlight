/**
 * Run `task` over `items` with at most `concurrency` in flight (docs/03 §3).
 * Pure: no I/O of its own.
 *
 * `shouldStart` is consulted immediately before each item starts. The first
 * `false` stops all new starts; tasks already in flight still finish. This is
 * where enrich's wall-clock and budget guards live, so they bound what
 * *starts* and never interrupt a running assessment.
 *
 * `task` should handle its own failures. If one rejects anyway, nothing new
 * starts, in-flight tasks settle, and the pool rejects with the first error.
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  shouldStart: () => boolean,
  task: (item: T) => Promise<void>,
): Promise<{ started: number; stoppedEarly: boolean }> {
  // Held in an object so TypeScript doesn't narrow these across the awaits.
  const state = {
    next: 0,
    started: 0,
    stoppedEarly: false,
    failure: null as { error: unknown } | null,
  };

  const worker = async (): Promise<void> => {
    while (!state.stoppedEarly && state.failure === null && state.next < items.length) {
      if (!shouldStart()) {
        state.stoppedEarly = true;
        return;
      }
      const item = items[state.next++] as T;
      state.started++;
      try {
        await task(item);
      } catch (error) {
        if (state.failure === null) state.failure = { error };
        return;
      }
    }
  };

  const width = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  await Promise.all(Array.from({ length: width }, () => worker()));

  if (state.failure !== null) throw state.failure.error;
  return { started: state.started, stoppedEarly: state.stoppedEarly };
}
