/**
 * ocr.ts — Lazy-loaded Tesseract.js OCR engine.
 *
 * Design decisions:
 * - Worker is created once and reused; `createWorker` is deferred to first call
 *   so the 8 MB WASM is not downloaded until the user actually triggers OCR.
 * - Progress is reported via a callback so the UI can show a live progress bar.
 * - The canvas is captured at 2× scale for better recognition accuracy on
 *   high-DPI S-Pen strokes.
 */

export type OcrProgress = {
  status: string;
  progress: number; // 0–1
};

export type OcrResult = {
  text: string;
  confidence: number; // 0–100
  lines: Array<{ text: string; confidence: number }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workerInstance: any = null;
let workerReady = false;

async function getWorker(onProgress?: (p: OcrProgress) => void) {
  if (!workerReady) {
    const { createWorker } = await import("tesseract.js");
    workerInstance = await createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (onProgress) {
          onProgress({ status: m.status, progress: m.progress ?? 0 });
        }
      },
    });
    workerReady = true;
  }
  return workerInstance;
}

/**
 * Render the main canvas (#main-canvas) into an offscreen canvas at 2× scale,
 * then run Tesseract OCR on the resulting ImageData.
 */
export async function ocrCanvas(
  onProgress?: (p: OcrProgress) => void
): Promise<OcrResult> {
  const source = document.getElementById("main-canvas") as HTMLCanvasElement | null;
  if (!source) throw new Error("Canvas not found");

  // Capture at 2× for better ink recognition
  const scale = 2;
  const w = source.clientWidth * scale;
  const h = source.clientHeight * scale;

  const offscreen = document.createElement("canvas");
  offscreen.width  = w;
  offscreen.height = h;
  const ctx = offscreen.getContext("2d")!;

  // White background so Tesseract doesn't see transparent pixels as noise
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(offscreen);

  const lines = (data.lines ?? []).map((l: { text: string; confidence: number }) => ({
    text: l.text.trim(),
    confidence: Math.round(l.confidence),
  })).filter((l: { text: string }) => l.text.length > 0);

  return {
    text: data.text?.trim() ?? "",
    confidence: Math.round(data.confidence ?? 0),
    lines,
  };
}

/** Release the Tesseract worker (call on component unmount if needed). */
export async function terminateOcrWorker() {
  if (workerInstance && workerReady) {
    await workerInstance.terminate();
    workerInstance = null;
    workerReady = false;
  }
}
