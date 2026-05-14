import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";

import { scenesFile } from "@/lib/paths";
import type { Scene, SceneFile } from "@/lib/scenedetect";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    const raw = await readFile(scenesFile(id), "utf8");
    const data = JSON.parse(raw) as SceneFile;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Scenes not found" }, { status: 404 });
  }
}

interface SceneInput {
  start: number;
  end: number;
  label?: string;
}

interface PostBody {
  scenes: SceneInput[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scenes: inputScenes } = body;

  // Validate at least 1 scene
  if (!Array.isArray(inputScenes) || inputScenes.length === 0) {
    return NextResponse.json(
      { error: "At least 1 scene is required" },
      { status: 400 }
    );
  }

  // Validate each scene
  for (let i = 0; i < inputScenes.length; i++) {
    const s = inputScenes[i];
    if (typeof s.start !== "number" || s.start < 0) {
      return NextResponse.json(
        { error: `Scene ${i}: start must be >= 0` },
        { status: 400 }
      );
    }
    if (typeof s.end !== "number" || s.end <= s.start) {
      return NextResponse.json(
        { error: `Scene ${i}: end must be > start` },
        { status: 400 }
      );
    }
  }

  // Sort by start and check for overlaps
  const sorted = [...inputScenes].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      return NextResponse.json(
        { error: `Scenes overlap: scene ${i - 1} ends at ${sorted[i - 1].end}, scene ${i} starts at ${sorted[i].start}` },
        { status: 400 }
      );
    }
  }

  // Read existing detectedAt if available
  let detectedAt: string | undefined;
  try {
    const raw = await readFile(scenesFile(id), "utf8");
    const existing = JSON.parse(raw) as Partial<SceneFile>;
    detectedAt = existing.detectedAt;
  } catch {
    // no existing file
  }

  // Build new scenes with id fields
  const scenes: Scene[] = sorted.map((s, idx) => ({
    id: idx,
    start: s.start,
    end: s.end,
    startFrame: 0,
    endFrame: 0,
    ...(s.label !== undefined ? { label: s.label } : {}),
  }));

  interface SceneFileWithRefinedAt extends SceneFile {
    refinedAt: string;
  }

  const sceneFileData: SceneFileWithRefinedAt = {
    scenes,
    refined: true,
    detectedAt: detectedAt ?? new Date().toISOString(),
    refinedAt: new Date().toISOString(),
  };

  await writeFile(scenesFile(id), JSON.stringify(sceneFileData, null, 2), "utf8");

  return NextResponse.json(sceneFileData);
}
