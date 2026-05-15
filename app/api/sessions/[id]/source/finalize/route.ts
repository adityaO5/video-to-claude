import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import path from "path";
import { getSession, setSource, sessionRoot } from "@/lib/captureSession";
import { probeVideo } from "@/lib/probe";
import { ALLOWED_MIMES, extForMime } from "@/lib/uploadMime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    mime?: string;
  };
  const name = body.name ?? "video";
  const mime = body.mime ?? "video/mp4";
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: `Unsupported mime ${mime}` }, { status: 415 });
  }

  const ext = extForMime(mime);
  const sourcePath = path.join(sessionRoot(id), `source.${ext}`);
  if (!existsSync(sourcePath)) {
    return NextResponse.json({ error: "Source file missing — upload chunks first" }, { status: 400 });
  }

  // Probe only — no blocking faststart remux. Browser handles non-faststart
  // MP4 via HTTP Range requests; our source-stream route caches ranges so
  // initial moov-tail fetch happens once. Remuxing 1GB to "optimize" would
  // block finalize for tens of seconds with marginal benefit.
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
    name,
    ext,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
  });

  return NextResponse.json(updated);
}
