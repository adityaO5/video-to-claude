import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";

import {
  projectDir,
  sourceFile,
  probeFile,
  scenesFile,
  previewsDir,
  scenePreviewFile,
  ensureDir,
} from "@/lib/paths";
import { writeStatus, setProgress } from "@/lib/jobs";
import { probeVideo } from "@/lib/ffmpeg";
import { detectScenes, type Scene } from "@/lib/scenedetect";
import { previewFrame } from "@/lib/ffmpeg";

const DATA_ROOT = path.join(process.cwd(), "data", "projects");

// ─── Background pipeline ─────────────────────────────────────────────────────

async function runPipeline(
  projectId: string,
  videoPath: string,
  _sourceName: string
): Promise<void> {
  // 1. Probe
  await writeStatus(projectId, { status: "probing", progress: 5 });
  const probe = await probeVideo(videoPath);
  await fs.writeFile(probeFile(projectId), JSON.stringify(probe, null, 2), "utf8");

  // 2. Detect scenes
  await writeStatus(projectId, { status: "detecting", progress: 20 });
  const scenes: Scene[] = await detectScenes(videoPath, probe.duration);

  // 3. Generate preview frames
  await ensureDir(previewsDir(projectId));
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const midpoint = (scene.start + scene.end) / 2;
    await previewFrame(videoPath, midpoint, scenePreviewFile(projectId, scene.id));
    setProgress(
      projectId,
      "detecting",
      20 + Math.round((60 * (i + 1)) / scenes.length)
    );
  }

  // 4. Write scenes.json
  const sceneFileData = {
    scenes,
    refined: false,
    detectedAt: new Date().toISOString(),
  };
  await fs.writeFile(scenesFile(projectId), JSON.stringify(sceneFileData, null, 2), "utf8");

  // 5. Mark complete
  await writeStatus(projectId, { status: "awaiting_refinement", progress: 100 });
}

// ─── POST /api/projects ───────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const data = await request.formData();
  const file = data.get("video");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing video file" }, { status: 400 });
  }

  const projectId = nanoid(10);

  // Create project directory
  await ensureDir(projectDir(projectId));

  // Determine extension from original filename
  const originalName = file.name ?? "upload.mp4";
  const ext = originalName.includes(".")
    ? originalName.split(".").pop() ?? "mp4"
    : "mp4";

  // Write video to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(sourceFile(projectId, ext), buffer);

  // Store original filename
  await fs.writeFile(
    path.join(projectDir(projectId), "name.txt"),
    originalName,
    "utf8"
  );

  // Set initial status
  await writeStatus(projectId, { status: "queued", progress: 0 });

  // Kick off pipeline (fire-and-forget)
  runPipeline(projectId, sourceFile(projectId, ext), originalName).catch(
    async (err) => {
      await writeStatus(projectId, {
        status: "error",
        progress: 0,
        error: String(err),
      });
    }
  );

  return NextResponse.json({ projectId }, { status: 201 });
}

// ─── GET /api/projects ────────────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  status: string;
  progress: number;
  error?: string;
  sourceName?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export async function GET(): Promise<NextResponse> {
  let entries: string[];
  try {
    entries = await fs.readdir(DATA_ROOT);
  } catch {
    // DATA_ROOT doesn't exist yet — no projects
    return NextResponse.json([]);
  }

  // Gather summaries with mtime for sorting
  const withMtime: { mtime: number; summary: ProjectSummary }[] = [];

  for (const id of entries) {
    const dir = path.join(DATA_ROOT, id);

    // Must be a directory
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    // Read status.json (required)
    let statusData: { status: string; progress: number; error?: string } | null = null;
    try {
      const raw = await fs.readFile(path.join(dir, "status.json"), "utf8");
      statusData = JSON.parse(raw) as { status: string; progress: number; error?: string };
    } catch {
      continue; // skip projects without status
    }

    const summary: ProjectSummary = {
      id,
      status: statusData.status,
      progress: statusData.progress,
    };

    if (statusData.error) {
      summary.error = statusData.error;
    }

    // Read original filename from name.txt
    try {
      summary.sourceName = (await fs.readFile(path.join(dir, "name.txt"), "utf8")).trim();
    } catch {
      // optional
    }

    // Read probe.json for media metadata
    try {
      const probeRaw = await fs.readFile(path.join(dir, "probe.json"), "utf8");
      const probe = JSON.parse(probeRaw) as {
        duration?: number;
        width?: number;
        height?: number;
      };
      if (probe.duration !== undefined) summary.duration = probe.duration;
      if (probe.width !== undefined) summary.width = probe.width;
      if (probe.height !== undefined) summary.height = probe.height;
    } catch {
      // probe.json may not exist yet
    }

    withMtime.push({ mtime: stat.mtimeMs, summary });
  }

  // Sort descending by mtime
  withMtime.sort((a, b) => b.mtime - a.mtime);

  return NextResponse.json(withMtime.map((e) => e.summary));
}
