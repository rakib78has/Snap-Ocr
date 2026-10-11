import type * as TesseractModule from 'tesseract.js';
import { raceAbortable } from '../core/abortable.ts';
import { isBundledLanguage } from '../core/languages.ts';

/**
 * Backstop for a run that never finishes, most likely a stalled language
 * download. Generous because a first-time download on a slow connection is
 * legitimately slow; the Cancel button covers impatience.
 */
export const OCR_TIMEOUT_MS = 180_000;

/** Provided by lib/tesseract.min.js, loaded as a classic script before this module. */
function engine(): typeof TesseractModule {
  return (globalThis as unknown as { Tesseract: typeof TesseractModule }).Tesseract;
}

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface RecognizeOptions {
  language: string;
  onProgress(update: OcrProgress): void;
  /** Aborting rejects with CancelledError and stops the engine. */
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}

/**
 * Runs Tesseract over one image.
 *
 * A fresh worker is created per call and always terminated — on success,
 * failure, timeout (TimeoutError) or cancellation (CancelledError) — so no run
 * leaves a WASM instance holding the language model in memory.
 *
 * The worker, core and English model are loaded from the extension package.
 * Other languages leave `langPath` unset, so Tesseract.js fetches the model
 * from its default public CDN and caches it in IndexedDB.
 */
export async function recognizeText(image: string, options: RecognizeOptions): Promise<string> {
  const workerOptions: Partial<TesseractModule.WorkerOptions> = {
    workerPath: chrome.runtime.getURL('lib/worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract-core.wasm.js'),
    workerBlobURL: false,
    logger: (m: TesseractModule.LoggerMessage) => {
      if (typeof m.progress === 'number') {
        options.onProgress({ status: m.status || 'Working...', progress: m.progress });
      }
    },
  };

  if (isBundledLanguage(options.language)) {
    workerOptions.langPath = chrome.runtime.getURL('lib');
    workerOptions.gzip = false;
  }

  // Tesseract.js swallows start-up failures such as a failed language
  // download: createWorker() then never settles, and the error only reaches
  // this handler. Without it, such a run would hang until the timeout.
  let reportEngineError!: (error: Error) => void;
  const engineError = new Promise<never>((_, reject) => {
    reportEngineError = reject;
  });
  workerOptions.errorHandler = (data: unknown) => reportEngineError(new Error(String(data)));

  let worker: TesseractModule.Worker | undefined;
  let finished = false;

  const run = Promise.race([
    (async () => {
      const { createWorker, OEM } = engine();
      const created = await createWorker(options.language, OEM.LSTM_ONLY, workerOptions);
      worker = created;
      // Cancelled or timed out while the engine was still starting up.
      if (finished) throw new Error('Run abandoned');
      const { data } = await created.recognize(image);
      return data.text;
    })(),
    engineError,
  ]);

  try {
    return await raceAbortable(run, {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? OCR_TIMEOUT_MS,
    });
  } finally {
    finished = true;
    // A worker created after this point is released by the check in `run`.
    await terminate(worker);
    void run.finally(() => terminate(worker)).catch(() => undefined);
  }
}

async function terminate(worker: TesseractModule.Worker | undefined): Promise<void> {
  try {
    await worker?.terminate();
  } catch {
    // Already finished, failed or terminated; nothing more to release.
  }
}
