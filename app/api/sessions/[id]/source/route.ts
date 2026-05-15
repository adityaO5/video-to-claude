import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { getSession, setSource, sessionRoot } from "@/lib/captureSession";
import { probeVideo } from "@/lib/probe";

export const runtime = "nodejs";

const ALLOWED_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
]);

const EXT_FOR_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (s.status !== "waiting") {
    return NextResponse.json({ error: "Session already has a source" }, { status: 409 });
  }

  const form = await request.formData();
  const file = form.get("video");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No video file in form field 'video'" }, { status: 400 });
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported mime ${file.type}` }, { status: 415 });
  }

  const ext = EXT_FOR_MIME[file.type] ?? "mp4";
  const sourcePath = path.join(sessionRoot(id), `source.${ext}`);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(sourcePath, buf);

  let probe;
  try {
    probe = await probeVideo(sourcePath);
  } catch (e) {
    return NextResponse.json(
      { error: `Probe failed: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  const updated = await setSource(id, {
    name: file.name,
    ext,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
  });

  return NextResponse.json(updated);
}
