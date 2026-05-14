import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";

// ffmpeg-static types: the default export is string | null
const bin = ffmpegPath as string;

export interface ProbeResult {
  duration: number; // seconds
  fps: number;
  width: number;
  height: number;
  codec: string;
}

export interface ExtractOpts {
  start?: number; // seconds
  end?: number; // seconds
  fps?: number; // default 1
}

/** Collect stderr from a spawned process and resolve with it on close. */
function collectStderr(
  args: string[]
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    const chunks: Buffer[] = [];

    proc.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      resolve({ code: code ?? 0, stderr: Buffer.concat(chunks).toString() });
    });
  });
}

/**
 * Probe a video file for metadata.
 * ffmpeg exits with code 1 when given `-i` with no output — that's expected.
 * We only throw if duration cannot be parsed.
 */
export async function probeVideo(src: string): Promise<ProbeResult> {
  const { stderr } = await collectStderr(["-i", src]);

  // Duration: HH:MM:SS.ms
  const durMatch = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!durMatch) {
    throw new Error(`ffmpeg probe failed to find duration in output:\n${stderr}`);
  }
  const duration =
    parseInt(durMatch[1], 10) * 3600 +
    parseInt(durMatch[2], 10) * 60 +
    parseFloat(durMatch[3]);

  // FPS
  const fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s+fps/);
  const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;

  // Video stream line — resolution and codec
  const videoLineMatch = stderr.match(/Video:\s+(\w+)[^\n]*?(\d{2,5})x(\d{2,5})/);
  const codec = videoLineMatch ? videoLineMatch[1] : "";
  const width = videoLineMatch ? parseInt(videoLineMatch[2], 10) : 0;
  const height = videoLineMatch ? parseInt(videoLineMatch[3], 10) : 0;

  return { duration, fps, width, height, codec };
}

/**
 * Extract frames from a video into outDir as raw_%04d.png.
 */
export async function extractFrames(
  src: string,
  outDir: string,
  opts: ExtractOpts
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const fps = opts.fps ?? 1;
  const args: string[] = ["-y"];

  if (opts.start !== undefined) {
    args.push("-ss", String(opts.start));
  }
  if (opts.end !== undefined) {
    args.push("-to", String(opts.end));
  }

  args.push("-i", src, "-vf", `fps=${fps}`, path.join(outDir, "raw_%04d.png"));

  const { code, stderr } = await collectStderr(args);
  if (code !== 0) {
    throw new Error(`ffmpeg extractFrames failed (exit ${code}):\n${stderr}`);
  }
}

/**
 * Extract a single preview frame at time t into outPath.
 */
export async function previewFrame(
  src: string,
  t: number,
  outPath: string
): Promise<void> {
  const args = [
    "-y",
    "-ss", String(t),
    "-i", src,
    "-vframes", "1",
    "-q:v", "2",
    outPath,
  ];

  const { code, stderr } = await collectStderr(args);
  if (code !== 0) {
    throw new Error(`ffmpeg previewFrame failed (exit ${code}):\n${stderr}`);
  }
}
