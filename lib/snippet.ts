import { writeFile } from "fs/promises";
import path from "path";
import type { ProjectManifest } from "./manifest";
import { snippetFile, projectDir } from "./paths";

export function buildSnippet(
  projectId: string,
  sourceName: string,
  projectAbsDir: string,
  sceneId?: number,
  segId?: number
): string {
  // This function returns the snippet string; manifest is not available here,
  // so the caller should use buildSnippetFile for manifest-based generation.
  // For direct use, we generate a prompt stub with placeholders.
  // In practice this overload is used by buildSnippetFile which passes real frame paths.
  void projectId;
  void projectAbsDir;

  let header: string;
  if (sceneId !== undefined) {
    header = `Please analyze these frames from scene ${sceneId} of "${sourceName}".\n`;
  } else {
    header = `Please analyze these frames from "${sourceName}".\n`;
  }
  void segId;

  return (
    header +
    "For each frame, describe what changes vs the previous frame. " +
    "Call out UI state changes, user gestures, errors, or notable events. " +
    "Frames are in chronological order.\n\nFrames:\n"
  );
}

function buildSnippetFromManifest(
  manifest: ProjectManifest,
  projectAbsDir: string,
  sceneId?: number,
  segId?: number
): string {
  const { sourceName, scenes } = manifest;

  // Determine which scene(s)/segment(s) to include
  let targetScenes = scenes;

  if (sceneId !== undefined) {
    const scene = scenes.find((s) => s.id === sceneId);
    targetScenes = scene ? [scene] : [];
  } else {
    // Default: first scene only
    targetScenes = scenes.length > 0 ? [scenes[0]] : [];
  }

  const lines: string[] = [];

  for (const scene of targetScenes) {
    const start = scene.start.toFixed(2);
    const end = scene.end.toFixed(2);

    let targetSegments = scene.segments;

    if (sceneId !== undefined && segId !== undefined) {
      const seg = scene.segments.find((s) => s.id === segId);
      targetSegments = seg ? [seg] : [];
    } else if (sceneId === undefined) {
      // Default: first segment of first scene
      targetSegments = scene.segments.length > 0 ? [scene.segments[0]] : [];
    }

    for (const seg of targetSegments) {
      lines.push(
        `Please analyze these frames from scene ${scene.id} (${start}s–${end}s) of "${sourceName}".`
      );
      lines.push(
        "For each frame, describe what changes vs the previous frame. " +
          "Call out UI state changes, user gestures, errors, or notable events. " +
          "Frames are in chronological order."
      );
      lines.push("");
      lines.push("Frames:");

      for (const frame of seg.frames) {
        lines.push(frame.path);
      }
    }
  }

  void projectAbsDir;
  return lines.join("\n") + "\n";
}

/**
 * Compress a snippet by replacing the long common path prefix with a $ROOT alias.
 * Reduces token count by ~30-40 tokens per frame path.
 */
export function compressSnippet(snippet: string, projectAbsDir: string): string {
  const framesRoot = path.join(projectAbsDir, "frames");
  // Normalize to forward slashes for consistency
  const normalizedRoot = framesRoot.replace(/\\/g, "/");
  const compressed = snippet.replace(
    new RegExp(normalizedRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    "$ROOT"
  );
  // Also try backslash version on Windows
  const backslashRoot = framesRoot.replace(/\//g, "\\");
  const final = compressed.replace(
    new RegExp(backslashRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    "$ROOT"
  );
  return `$ROOT = ${normalizedRoot}\n\n${final}`;
}

export async function buildSnippetFile(
  manifest: ProjectManifest,
  projectId: string
): Promise<void> {
  const absDir = projectDir(projectId);
  const content = buildSnippetFromManifest(manifest, absDir, 0, 0);
  await writeFile(snippetFile(projectId), content, "utf8");
}
