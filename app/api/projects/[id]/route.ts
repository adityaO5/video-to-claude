import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

import {
  projectDir,
  probeFile,
  scenesFile,
  framesManifest,
} from "@/lib/paths";
import { readStatus } from "@/lib/jobs";
import type { ProbeResult } from "@/lib/ffmpeg";
import type { SceneFile } from "@/lib/scenedetect";
import type { ProjectManifest } from "@/lib/manifest";
import type { StatusData } from "@/lib/jobs";

interface ProjectStateResponse {
  id: string;
  status: StatusData;
  probe?: ProbeResult;
  scenes?: SceneFile;
  manifest?: ProjectManifest;
  sourceName?: string;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const dir = projectDir(id);

  // Check project directory exists
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Read status (required)
  const statusData = await readStatus(id);
  if (!statusData) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const response: ProjectStateResponse = { id, status: statusData };

  // Read probe.json
  try {
    const raw = await readFile(probeFile(id), "utf8");
    response.probe = JSON.parse(raw) as ProbeResult;
  } catch {
    // optional
  }

  // Read scenes.json
  try {
    const raw = await readFile(scenesFile(id), "utf8");
    response.scenes = JSON.parse(raw) as SceneFile;
  } catch {
    // optional
  }

  // Read frames.json (manifest)
  try {
    const raw = await readFile(framesManifest(id), "utf8");
    response.manifest = JSON.parse(raw) as ProjectManifest;
  } catch {
    // optional
  }

  // Read name.txt
  try {
    const raw = await readFile(path.join(dir, "name.txt"), "utf8");
    response.sourceName = raw.trim();
  } catch {
    // optional
  }

  return NextResponse.json(response);
}
