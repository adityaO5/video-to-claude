import sharp from "sharp";
import { statSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";

export type Quality = "low" | "med" | "high";

interface Preset { maxW: number; maxH: number; q: number; cap: number; }

const PRESETS: Record<Quality, Preset> = {
  low:  { maxW: 640,  maxH: 360, q: 70, cap: 2_000_000 },
  med:  { maxW: 960,  maxH: 540, q: 80, cap: 2_000_000 },
  high: { maxW: 1280, maxH: 720, q: 85, cap: 3_000_000 },
};

export interface CompressResult {
  width: number;
  height: number;
  bytes: number;
}

export async function compressFrame(
  srcPng: string,
  destWebp: string,
  quality: Quality = "med"
): Promise<CompressResult> {
  const preset = PRESETS[quality];
  const qualities = [preset.q, preset.q - 10, preset.q - 20];

  let result: CompressResult | null = null;

  for (const q of qualities) {
    const img = sharp(srcPng)
      .resize(preset.maxW, preset.maxH, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: Math.max(1, q) });

    const { data, info } = await img.toBuffer({ resolveWithObject: true });

    if (data.length <= preset.cap || q === qualities[qualities.length - 1]) {
      await sharp(data).toFile(destWebp);
      result = { width: info.width, height: info.height, bytes: data.length };
      break;
    }
  }

  return result!;
}

// ── Adaptive send-time compression ───────────────────────────────────────────

interface AdaptiveConfig {
  maxWidth: number;
  targetBytes: number;
  minQuality: number;
}

function adaptiveConfig(totalCount: number): AdaptiveConfig {
  if (totalCount <= 2)  return { maxWidth: 960, targetBytes: 1_500_000, minQuality: 55 };
  if (totalCount <= 5)  return { maxWidth: 880, targetBytes:   900_000, minQuality: 50 };
  if (totalCount <= 10) return { maxWidth: 720, targetBytes:   500_000, minQuality: 45 };
  if (totalCount <= 20) return { maxWidth: 600, targetBytes:   280_000, minQuality: 40 };
  return                     { maxWidth: 480, targetBytes:   150_000, minQuality: 35 };
}

export interface CompressionResult {
  compressedPath: string;
  originalBytes: number;
  compressedBytes: number;
}

export async function compressCapture(
  srcPath: string,
  totalCount: number
): Promise<CompressionResult> {
  const cfg = adaptiveConfig(totalCount);
  const originalBytes = statSync(srcPath).size;

  const ext = path.extname(srcPath);
  const compressedPath = srcPath.replace(ext, `_c${ext}`);

  let quality = 82;
  let buf: Buffer = Buffer.alloc(0);

  while (true) {
    buf = await sharp(srcPath)
      .resize({ width: cfg.maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    if (buf.length <= cfg.targetBytes || quality <= cfg.minQuality) break;
    quality -= 5;
  }

  await writeFile(compressedPath, buf);
  return { compressedPath, originalBytes, compressedBytes: buf.length };
}

export interface CompressionStats {
  originalTotalBytes: number;
  compressedTotalBytes: number;
  savedBytes: number;
  count: number;
}

export function summarizeStats(results: CompressionResult[]): CompressionStats {
  const originalTotalBytes = results.reduce((s, r) => s + r.originalBytes, 0);
  const compressedTotalBytes = results.reduce((s, r) => s + r.compressedBytes, 0);
  return {
    originalTotalBytes,
    compressedTotalBytes,
    savedBytes: originalTotalBytes - compressedTotalBytes,
    count: results.length,
  };
}
