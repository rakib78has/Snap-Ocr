import type * as TesseractModule from 'tesseract.js';
import { isBundledLanguage } from '../core/languages.ts';

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
}

/**
 * Runs Tesseract over one image.
 *
 * A fresh worker is created per call and always terminated, so a failed run
 * never leaves a WASM instance holding the language model in memory.
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

  let worker: TesseractModule.Worker | undefined;
  try {
    const { createWorker, OEM } = engine();
    worker = await createWorker(options.language, OEM.LSTM_ONLY, workerOptions);
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // The run already finished or failed; a terminate error adds nothing.
      }
    }
  }
}
