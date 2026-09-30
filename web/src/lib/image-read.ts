// Reading images on this device: QR codes (the browser's own detector where there is one, jsQR otherwise) and the
// words in screenshots (tesseract.js, English and Hindi). The image never leaves the device; the first screenshot
// downloads the reading model (a few MB, from jsDelivr), which the browser then keeps.

const READABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]);
const MAX_SIDE = 1600;
const VIDEO_SIDE = 720;

export function isReadableImage(file: File): boolean {
  return READABLE.has(file.type);
}

export function tidyOcr(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Detector = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> };
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

let native: Promise<Detector | null> | null = null;

function nativeDetector(): Promise<Detector | null> {
  native ??= (async () => {
    const BarcodeDetector = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    if (!BarcodeDetector) return null;
    try {
      return (await BarcodeDetector.getSupportedFormats()).includes("qr_code") ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
    } catch {
      return null;
    }
  })();
  return native;
}

function draw(source: CanvasImageSource, width: number, height: number, maxSide: number, canvas = document.createElement("canvas")) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function decode(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, thorough: boolean): Promise<string | null> {
  const detector = await nativeDetector();
  if (detector) {
    try {
      const found = await detector.detect(canvas);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch {
      // Fall through to jsQR.
    }
    if (!thorough) return null;
  }
  const { default: jsQR } = await import("jsqr");
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height, { inversionAttempts: thorough ? "attemptBoth" : "dontInvert" })?.data || null;
}

/** The QR code in a picture or screenshot, if there is one. */
export async function qrFromImage(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const { canvas, ctx } = draw(bitmap, bitmap.width, bitmap.height, MAX_SIDE);
  bitmap.close();
  return decode(canvas, ctx, true);
}

/** The QR code in the camera's current frame, if there is one. Called many times a second, so it stays quick. */
export async function qrFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null> {
  if (!video.videoWidth) return null;
  const { ctx } = draw(video, video.videoWidth, video.videoHeight, VIDEO_SIDE, canvas);
  return decode(canvas, ctx, false);
}

export type ReadProgress = { stage: "loading" | "reading"; progress: number };

/** The words in a screenshot, read on this device. */
export async function textFromImage(file: Blob, onProgress?: (p: ReadProgress) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["eng", "hin"], 1, {
    logger: (m: { status: string; progress: number }) =>
      onProgress?.({ stage: m.status === "recognizing text" ? "reading" : "loading", progress: m.progress }),
  });
  try {
    const { data } = await worker.recognize(file);
    return tidyOcr(data.text);
  } finally {
    await worker.terminate();
  }
}
