export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

export class CancelledError extends Error {
  override name = 'CancelledError';
}

export interface AbortableOptions {
  signal?: AbortSignal | undefined;
  timeoutMs: number;
}

/**
 * Settles with `task`, unless `signal` aborts first (CancelledError) or
 * `timeoutMs` passes (TimeoutError). The task itself is not stopped — callers
 * release its resources — but a late rejection from it is swallowed so it
 * never surfaces as an unhandled rejection.
 */
export function raceAbortable<T>(task: Promise<T>, options: AbortableOptions): Promise<T> {
  const { signal, timeoutMs } = options;
  task.catch(() => undefined);

  if (signal?.aborted) return Promise.reject(new CancelledError('Cancelled'));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => finish(() => reject(new CancelledError('Cancelled')));
    const timer = setTimeout(
      () => finish(() => reject(new TimeoutError(`Timed out after ${timeoutMs} ms`))),
      timeoutMs
    );
    let settled = false;

    function finish(settle: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      settle();
    }

    signal?.addEventListener('abort', onAbort, { once: true });
    // Resolving with the task adopts its outcome, success or failure, as-is.
    const settleWithTask = () => finish(() => resolve(task));
    task.then(settleWithTask, settleWithTask);
  });
}
