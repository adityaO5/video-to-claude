import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";

const exec = promisify(execFile);

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

function evalFrac(v: string): number {
  if (!v.includes("/")) return Number(v);
  const [n, d] = v.split("/").map(Number);
  return d === 0 ? 0 : n / d;
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  if (!ffmpegPath) throw new Error("ffmpeg-static not available");
  let stderr = "";
  try {
    const result = await exec(ffmpegPath, ["-i", filePath, "-hide_banner", "-f", "null", "-"]);
    stderr = result.stderr;
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    stderr = err.stderr ?? "";
    if (!stderr) throw new Error(err.message ?? "probe failed");
  }

  const durMatch = stderr.match(/Duration:\s+(\d+):(\d+):(\d+\.?\d*)/);
  if (!durMatch) throw new Error("probe: duration not found");
  const duration =
    Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);

  const vMatch = stderr.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})[^\n]*/);
  if (!vMatch) throw new Error("probe: video stream not found");
  const width = Number(vMatch[1]);
  const height = Number(vMatch[2]);

  const fpsMatch = stderr.match(/(\d+(?:\.\d+)?(?:\/\d+)?)\s*fps/);
  const tbrMatch = stderr.match(/(\d+(?:\.\d+)?(?:\/\d+)?)\s*tbr/);
  const fpsRaw = fpsMatch?.[1] ?? tbrMatch?.[1] ?? "0";
  const fps = evalFrac(fpsRaw);

  return { duration, width, height, fps };
}
