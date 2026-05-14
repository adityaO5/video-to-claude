import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";

import { projectDir, tmpDir, ensureDir } from "@/lib/paths";
import { previewFrame } from "@/lib/ffmpeg";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  const tParam = request.nextUrl.searchParams.get("t");
  const t = tParam !== null ? parseFloat(tParam) : 0;

  // Find source file in project dir (source.*)
  const dir = projectDir(id);
  let sourcePath: string | null = null;

  try {
    const entries = await readdir(dir);
    const sourceEntry = entries.find((e) => e.startsWith("source."));
    if (sourceEntry) {
      sourcePath = path.join(dir, sourceEntry);
    }
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!sourcePath) {
    return NextResponse.json({ error: "Source file not found" }, { status: 404 });
  }

  // Ensure tmp directory exists
  const tmpDirPath = tmpDir(id);
  await ensureDir(tmpDirPath);

  const tmpJpegPath = path.join(tmpDirPath, "preview.jpg");

  try {
    await previewFrame(sourcePath, t, tmpJpegPath);
  } catch {
    return NextResponse.json({ error: "Failed to generate preview frame" }, { status: 500 });
  }

  try {
    const buffer = await readFile(tmpJpegPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read preview frame" }, { status: 500 });
  }
}
