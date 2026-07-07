import { GlobalWorkerOptions } from 'pdfjs-dist';
import workerCode from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

let workerBlobUrl: string | null = null;

/**
 * Worker do PDF.js via blob: (sem fetch de /assets/pdf.worker.*.mjs).
 * Não usar workerPort global — destruir um documento derruba o worker compartilhado.
 */
export function setupPdfJsWorker(): void {
  if (workerBlobUrl) {
    GlobalWorkerOptions.workerSrc = workerBlobUrl;
    return;
  }

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  workerBlobUrl = URL.createObjectURL(blob);
  GlobalWorkerOptions.workerSrc = workerBlobUrl;
}
