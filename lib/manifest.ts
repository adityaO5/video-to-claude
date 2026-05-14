import path from "path";
import { writeFile } from "fs/promises";
import type { FrameMeta } from "./segment";
import type { Scene } from "./scenedetect";
import type { ProbeResult } from "./ffmpeg";
import { framesManifest, framesMd } from "./paths";

export interface SegmentManifest {
  id: number;
  frames: FrameMeta[];
}

export interface SceneManifest {
  id: number;
  start: number;
  end: number;
  label?: string;
  segments: SegmentManifest[];
}

export interface ProjectManifest {
  projectId: string;
  sourceName: string;
  probe: ProbeResult;
  scenes: SceneManifest[];
  createdAt: string;
}

export async function buildManifest(
  projectId: string,
  sourceName: string,
  probe: ProbeResult,
  sceneManifests: SceneManifest[]
): Promise<ProjectManifest> {
  const manifest: ProjectManifest = {
    projectId,
    sourceName,
    probe,
    scenes: sceneManifests,
    createdAt: new Date().toISOString(),
  };

  await writeFile(framesManifest(projectId), JSON.stringify(manifest, null, 2), "utf8");

  return manifest;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export async function buildMarkdown(manifest: ProjectManifest, projectId: string): Promise<void> {
  const { sourceName, probe, scenes } = manifest;
  const lines: string[] = [];

  lines.push(`# Frames: ${sourceName}`);
  lines.push(`Duration: ${probe.duration}s  FPS: ${probe.fps}  Resolution: ${probe.width}×${probe.height}`);

  for (const scene of scenes) {
    lines.push("");
    lines.push(`## Scene ${scene.id} (${scene.start.toFixed(2)}s – ${scene.end.toFixed(2)}s)`);

    for (const seg of scene.segments) {
      lines.push("");
      const firstIdx = seg.frames[0]?.idx ?? 0;
      const lastIdx = seg.frames[seg.frames.length - 1]?.idx ?? 0;
      lines.push(`### Segment ${seg.id} (frames ${firstIdx}–${lastIdx})`);

      for (const frame of seg.frames) {
        const basename = path.basename(frame.path);
        lines.push(
          `- ${basename}  [${frame.t.toFixed(1)}s]  ${frame.width}×${frame.height}  ${formatBytes(frame.bytes)}`
        );
      }
    }
  }

  await writeFile(framesMd(projectId), lines.join("\n") + "\n", "utf8");
}
