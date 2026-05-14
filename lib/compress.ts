import sharp from "sharp";

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
