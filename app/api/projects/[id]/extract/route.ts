import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir, rm } from "fs/promises";
import path from "path";

import {
  projectDir,
  scenesFile,
  probeFile,
  tmpDir,
  sceneDir,
  segDir,
  ensureDir,
} from "@/lib/paths";
import { writeStatus, setProgress } from "@/lib/jobs";
import { extractFrames } from "@/lib/ffmpeg";
import type { ProbeResult } from "@/lib/ffmpeg";
import { compressFrame } from "@/lib/compress";
import type { Quality } from "@/lib/compress";
import { chunkFrames } from "@/lib/segment";
import type { FrameMeta } from "@/lib/segment";
import { buildManifest, buildMarkdown } from "@/lib/manifest";
import { buildSnippetFile } from "@/lib/snippet";
import type { SceneFile, Scene } from "@/lib/scenedetect";

interface ExtractBody {
  sceneIds?: number[];
  fps?: number;
  quality?: Quality;
}

async function findSourceFile(id: string): Promise<{ filePath: string; name: string } | null> {
  const dir = projectDir(id);
  try {
    const entries = await readdir(dir);
    const sourceEntry = entries.find((e) => /^source\.\w+$/.test(e));
    if (!sourceEntry) return null;
    return { filePath: path.join(dir, sourceEntry), name: sourceEntry };
  } catch {
    return null;
  }
}

async function runExtractJob(
  id: string,
  chosenScenes: Scene[],
  sourceFilePath: string,
  sourceName: string,
  probe: ProbeResult,
  opts: Required<ExtractBody>
): Promise<void> {
  await writeStatus(id, { status: "extracting", progress: 0 });

  const segmentedFrames: FrameMeta[][] [] = [];

  for (let i = 0; i < chosenScenes.length; i++) {
    const scene = chosenScenes[i];

    // Create output dir for scene frames
    await ensureDir(sceneDir(id, scene.id));

    // Create tmp dir for raw PNGs
    const rawDir = path.join(tmpDir(id), `scene_${scene.id}`);
    await ensureDir(rawDir);

    // Extract frames via ffmpeg
    await extractFrames(sourceFilePath, rawDir, {
      start: scene.start,
      end: scene.end,
      fps: opts.fps,
    });

    // List PNG files sorted by name
    const allEntries = await readdir(rawDir);
    const pngFiles = allEntries.filter((f) => f.endsWith(".png")).sort();

    const frameMetas: FrameMeta[] = [];

    for (let idx = 0; idx < pngFiles.length; idx++) {
      const pngFile = pngFiles[idx];
      const rawPng = path.join(rawDir, pngFile);

      // Compute timestamp
      const t = scene.start + idx / opts.fps;

      // Compute frame name
      const totalSec = Math.floor(t);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const ss = String(totalSec % 60).padStart(2, "0");
      const frameName = `f${String(idx + 1).padStart(4, "0")}_${mm}m${ss}s.webp`;

      // Determine segment index for this frame
      const segIdx = Math.floor(idx / 25);
      const destSegDir = segDir(id, scene.id, segIdx);
      await ensureDir(destSegDir);

      const destWebp = path.join(destSegDir, frameName);

      // Compress PNG to WebP
      const compressResult = await compressFrame(rawPng, destWebp, opts.quality);

      frameMetas.push({
        idx,
        path: destWebp,
        t,
        width: compressResult.width,
        height: compressResult.height,
        bytes: compressResult.bytes,
      });
    }

    // Chunk frames into segments
    const chunks = chunkFrames(frameMetas, 25);
    segmentedFrames.push(chunks);

    // Update progress
    setProgress(id, "extracting", Math.round(100 * (i + 1) / chosenScenes.length));
  }

  // Build scene manifests
  const sceneManifests = chosenScenes.map((s, i) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    label: s.label,
    segments: segmentedFrames[i].map((seg, si) => ({ id: si, frames: seg })),
  }));

  // Build and write manifest + markdown + snippet
  const manifest = await buildManifest(id, sourceName, probe, sceneManifests);
  await buildMarkdown(manifest, id);
  await buildSnippetFile(manifest, id);

  await writeStatus(id, { status: "done", progress: 100 });

  // Clean up tmp dir (optional)
  try {
    await rm(tmpDir(id), { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  // Parse body
  let body: ExtractBody = {};
  try {
    body = (await request.json()) as ExtractBody;
  } catch {
    // empty body is ok
  }

  const opts: Required<ExtractBody> = {
    sceneIds: body.sceneIds ?? [],
    fps: body.fps ?? 1,
    quality: body.quality ?? "med",
  };

  // Find source file
  const sourceInfo = await findSourceFile(id);
  if (!sourceInfo) {
    return NextResponse.json({ error: "Source file not found" }, { status: 404 });
  }

  // Read scenes.json
  let sceneFile: SceneFile;
  try {
    const raw = await readFile(scenesFile(id), "utf8");
    sceneFile = JSON.parse(raw) as SceneFile;
  } catch {
    return NextResponse.json({ error: "scenes.json not found — run scene detection first" }, { status: 400 });
  }

  // Read probe.json
  let probe: ProbeResult;
  try {
    const raw = await readFile(probeFile(id), "utf8");
    probe = JSON.parse(raw) as ProbeResult;
  } catch {
    return NextResponse.json({ error: "probe.json not found" }, { status: 400 });
  }

  // Filter scenes
  const allScenes = sceneFile.scenes;
  const chosenScenes =
    opts.sceneIds.length > 0
      ? allScenes.filter((s) => opts.sceneIds.includes(s.id))
      : allScenes;

  if (chosenScenes.length === 0) {
    return NextResponse.json({ error: "No scenes matched" }, { status: 400 });
  }

  // Fire-and-forget background job
  runExtractJob(id, chosenScenes, sourceInfo.filePath, sourceInfo.name, probe, opts).catch(
    async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      await writeStatus(id, { status: "error", progress: 0, error: msg }).catch(() => {});
    }
  );

  return NextResponse.json(
    { ok: true, sceneCount: chosenScenes.length },
    { status: 202 }
  );
}
