import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { buildAnnotationSvg, type Shape } from "@/lib/annotateSvg";

const exec = promisify(execFile);

export interface CaptureInput {
  sourcePath: string;
  t: number;
  shapes: Shape[];
  displayW: number;
  displayH: number;
  sourceWidth: number;
  sourceHeight: number;
  outPath: string;
  targetWidth?: number;
  maxBytes?: number;
}

export interface CaptureResult {
  outPath: string;
  bytes: number;
  finalQuality: number;
}

export async function captureAnnotatedFrame(input: CaptureInput): Promise<CaptureResult> {
  if (!ffmpegPath) throw new Error("ffmpeg-static not available");
  const targetWidth = input.targetWidth ?? 960;
  const maxBytes = input.maxBytes ?? 2_000_000;

  const args = [
    "-ss", String(input.t),
    "-i", input.sourcePath,
    "-frames:v", "1",
    "-f", "image2pipe",
    "-vcodec", "png",
    "-",
  ];
  let pngBuf: Buffer;
  try {
    const { stdout } = await exec(ffmpegPath, args, {
      encoding: "buffer",
      maxBuffer: 50 * 1024 * 1024,
    });
    pngBuf = stdout as Buffer;
    if (!pngBuf || pngBuf.length === 0) throw new Error("ffmpeg returned empty frame");
  } catch (e) {
    const err = e as { stderr?: string | Buffer; message?: string };
    const tail = err.stderr ? String(err.stderr).split("\n").slice(-5).join("\n") : "";
    throw new Error(`ffmpeg seek failed at t=${input.t}: ${tail || err.message}`);
  }

  // Step 1: composite shapes (if any) at native resolution to produce a flat PNG.
  let flatPng: Buffer;
  if (input.shapes.length > 0) {
    const svg = buildAnnotationSvg(
      input.sourceWidth,
      input.sourceHeight,
      input.shapes,
      input.displayW,
      input.displayH
    );
    flatPng = await sharp(pngBuf)
      .composite([{ input: Buffer.from(svg), blend: "over" }])
      .png()
      .toBuffer();
  } else {
    flatPng = pngBuf;
  }

  // Step 2: resize + webp encode with size-retry loop.
  let quality = 80;
  let bytes = 0;
  while (quality >= 50) {
    const buf = await sharp(flatPng)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    bytes = buf.length;
    if (bytes <= maxBytes) {
      const { writeFile } = await import("fs/promises");
      await writeFile(input.outPath, buf);
      return { outPath: input.outPath, bytes, finalQuality: quality };
    }
    quality -= 5;
  }

  const buf = await sharp(flatPng)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .webp({ quality: 50 })
    .toBuffer();
  const { writeFile } = await import("fs/promises");
  await writeFile(input.outPath, buf);
  return { outPath: input.outPath, bytes: buf.length, finalQuality: 50 };
}
