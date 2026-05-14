import { spawn } from "child_process";

export interface Scene {
  id: number; // 0-based index
  start: number; // seconds
  end: number; // seconds
  startFrame: number;
  endFrame: number;
  label?: string;
}

export interface SceneFile {
  scenes: Scene[];
  refined: boolean;
  detectedAt: string; // ISO timestamp
}

/**
 * Spawn `python -m scenedetect` (falling back to `python3`) and collect stdout.
 * Throws on spawn errors (e.g. command not found).
 */
function spawnSceneDetect(
  pythonBin: string,
  videoPath: string
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-m",
      "scenedetect",
      "-i",
      videoPath,
      "detect-content",
      "--threshold",
      "27",
      "list-scenes",
      "-q",
    ];

    const proc = spawn(pythonBin, args);
    const stdoutChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      resolve({
        code: code ?? 0,
        stdout: Buffer.concat(stdoutChunks).toString(),
      });
    });
  });
}

/**
 * Parse PySceneDetect CSV output into Scene[].
 *
 * CSV columns (0-indexed):
 *   0: Scene Number (1-based)
 *   1: Start Frame
 *   2: Start Timecode
 *   3: Start Time (seconds)
 *   4: End Frame
 *   5: End Timecode
 *   6: End Time (seconds)
 *   7: Length (frames)
 *   8: Length (timecode)
 *   9: Length (seconds)
 */
function parseCsv(stdout: string): Scene[] {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Drop header line(s) — skip until we find a line whose first field is numeric
  const dataLines = lines.filter((l) => /^\d+,/.test(l));

  return dataLines.map((line) => {
    const cols = line.split(",");
    const sceneNumber = parseInt(cols[0], 10); // 1-based
    const startFrame = parseInt(cols[1], 10);
    const start = parseFloat(cols[3]);
    const endFrame = parseInt(cols[4], 10);
    const end = parseFloat(cols[6]);

    return {
      id: sceneNumber - 1, // convert to 0-based
      start,
      end,
      startFrame,
      endFrame,
    };
  });
}

/**
 * Detect scenes in a video using PySceneDetect.
 *
 * - Tries `python` first; on ENOENT falls back to `python3`.
 * - If both fail, throws with an install hint.
 * - If no scenes are detected (empty or header-only output), returns a single
 *   scene covering the full duration.
 */
export async function detectScenes(
  videoPath: string,
  duration: number
): Promise<Scene[]> {
  let stdout: string;

  for (const bin of ["python", "python3"]) {
    try {
      const result = await spawnSceneDetect(bin, videoPath);
      stdout = result.stdout;
      break;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        if (bin === "python3") {
          throw new Error(
            "Python not found. Install Python and run: pip install scenedetect[opencv-headless]"
          );
        }
        // Try next bin
        continue;
      }
      throw err;
    }
  }

  // TypeScript requires stdout to be definitely assigned; the loop above either
  // sets it or throws, so this cast is safe.
  const output = stdout!;

  const scenes = parseCsv(output);

  if (scenes.length === 0) {
    return [{ id: 0, start: 0, end: duration, startFrame: 0, endFrame: 0 }];
  }

  return scenes;
}
