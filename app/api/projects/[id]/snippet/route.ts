import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";

import { framesManifest, projectDir } from "@/lib/paths";
import { buildSnippet } from "@/lib/snippet";
import type { ProjectManifest } from "@/lib/manifest";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  const sceneParam = searchParams.get("scene");
  const segParam = searchParams.get("seg");

  const sceneId = sceneParam !== null ? parseInt(sceneParam, 10) : undefined;
  const segId = segParam !== null ? parseInt(segParam, 10) : undefined;

  // Read frames.json to get source name
  let manifest: ProjectManifest;
  try {
    const raw = await readFile(framesManifest(id), "utf8");
    manifest = JSON.parse(raw) as ProjectManifest;
  } catch {
    return NextResponse.json({ error: "frames.json not found — run extract first" }, { status: 404 });
  }

  const snippet = buildSnippet(
    id,
    manifest.sourceName,
    projectDir(id),
    sceneId,
    segId
  );

  return new NextResponse(snippet, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
