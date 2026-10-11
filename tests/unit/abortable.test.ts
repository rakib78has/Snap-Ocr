import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelledError, raceAbortable, TimeoutError } from '../../src/core/abortable.ts';
import { resolveInitialLanguage } from '../../src/core/languages.ts';
import { describeOcrFailure } from '../../src/core/ocr-errors.ts';

const never = () => new Promise<string>(() => undefined);

describe('raceAbortable', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the task when it finishes in time', async () => {
    await expect(raceAbortable(Promise.resolve('text'), { timeoutMs: 1000 })).resolves.toBe('text');
  });

  it('passes through the task’s own failure', async () => {
    const failure = new Error('engine crashed');
    await expect(raceAbortable(Promise.reject(failure), { timeoutMs: 1000 })).rejects.toBe(failure);
  });

  it('rejects with TimeoutError when the task hangs', async () => {
    const result = raceAbortable(never(), { timeoutMs: 1000 });
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('rejects with CancelledError when aborted mid-run', async () => {
    const controller = new AbortController();
    const result = raceAbortable(never(), { signal: controller.signal, timeoutMs: 1000 });
    controller.abort();
    await expect(result).rejects.toBeInstanceOf(CancelledError);
  });

  it('rejects immediately when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      raceAbortable(never(), { signal: controller.signal, timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(CancelledError);
  });

  it('ignores a timeout or abort after the task has settled', async () => {
    const controller = new AbortController();
    const result = await raceAbortable(Promise.resolve('done'), {
      signal: controller.signal,
      timeoutMs: 10,
    });
    controller.abort();
    await vi.advanceTimersByTimeAsync(50);
    expect(result).toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not leave a late task rejection unhandled after a timeout', async () => {
    let rejectTask!: (reason: unknown) => void;
    const task = new Promise<string>((_, reject) => (rejectTask = reject));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const result = raceAbortable(task, { timeoutMs: 10 });
      const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
      rejectTask(new Error('worker terminated'));
      await vi.runAllTimersAsync();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('describeOcrFailure', () => {
  it('shows nothing for a user cancellation', () => {
    expect(describeOcrFailure(new CancelledError('Cancelled'), 'eng')).toBeNull();
  });

  it('suggests a smaller area when a bundled-language run times out', () => {
    expect(describeOcrFailure(new TimeoutError('x'), 'eng')).toMatch(/smaller area/);
  });

  it('points at the connection when a downloaded language times out or fails', () => {
    expect(describeOcrFailure(new TimeoutError('x'), 'fra')).toMatch(/internet connection/);
    expect(describeOcrFailure(new Error('Failed to fetch'), 'fra')).toBe(
      'OCR failed: Failed to fetch. This language is downloaded on first use, so check your internet connection.'
    );
  });

  it('reports the engine error for the bundled language', () => {
    expect(describeOcrFailure(new Error('bad image'), 'eng')).toBe('OCR failed: bad image');
    expect(describeOcrFailure('weird', 'eng')).toBe('OCR failed: weird');
  });
});

describe('resolveInitialLanguage (regression: M8)', () => {
  it('keeps a known stored language', () => {
    expect(resolveInitialLanguage('fra')).toBe('fra');
  });

  it.each([undefined, '', 'xx_not_a_language', 42, null])(
    'falls back to English for %s',
    (stored) => expect(resolveInitialLanguage(stored)).toBe('eng')
  );
});
