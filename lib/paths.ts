import path from "path";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

const DATA_ROOT = path.join(process.cwd(), "data", "projects");

export function projectDir(id: string) {
  return path.join(DATA_ROOT, id);
}

export function sourceFile(id: string, ext = "mp4") {
  return path.join(projectDir(id), `source.${ext}`);
}

export function statusFile(id: string) {
  return path.join(projectDir(id), "status.json");
}

export function probeFile(id: string) {
  return path.join(projectDir(id), "probe.json");
}

export function scenesFile(id: string) {
  return path.join(projectDir(id), "scenes.json");
}

export function framesManifest(id: string) {
  return path.join(projectDir(id), "frames.json");
}

export function framesMd(id: string) {
  return path.join(projectDir(id), "frames.md");
}

export function snippetFile(id: string) {
  return path.join(projectDir(id), "snippet.txt");
}

export function sceneDir(id: string, sceneIdx: number) {
  return path.join(projectDir(id), "frames", `scene_${String(sceneIdx).padStart(3, "0")}`);
}

export function segDir(id: string, sceneIdx: number, segIdx: number) {
  return path.join(sceneDir(id, sceneIdx), `seg_${String(segIdx).padStart(3, "0")}`);
}

export function previewsDir(id: string) {
  return path.join(projectDir(id), "scenes");
}

export function scenePreviewFile(id: string, sceneIdx: number) {
  return path.join(previewsDir(id), `scene_${String(sceneIdx).padStart(3, "0")}_preview.jpg`);
}

export function tmpDir(id: string) {
  return path.join(projectDir(id), "tmp");
}

export async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}
