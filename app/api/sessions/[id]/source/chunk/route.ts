import { NextRequest, NextResponse } from "next/server";
import { writeFile, appendFile } from "fs/promises";
import path from "path";
import { getSession, sessionRoot } from "@/lib/captureSession";
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

  const chunkIndex = Number(request.headers.get("x-chunk-index") ?? "");
  const chunkTotal = Number(request.headers.get("x-chunk-total") ?? "");
  const mime = request.headers.get("x-file-mime") ?? "";
  const name = request.headers.get("x-file-name") ?? "";

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return NextResponse.json({ error: "Missing/invalid x-chunk-index" }, { status: 400 });
  }
  if (!Number.isInteger(chunkTotal) || chunkTotal < 1) {
    return NextResponse.json({ error: "Missing/invalid x-chunk-total" }, { status: 400 });
  }
  if (chunkIndex >= chunkTotal) {
    return NextResponse.json({ error: "chunk index out of range" }, { status: 400 });
  }
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: `Unsupported mime ${mime}` }, { status: 415 });
  }
  if (!name) {
    return NextResponse.json({ error: "Missing x-file-name" }, { status: 400 });
  }

  const ext = extForMime(mime);
  const sourcePath = path.join(sessionRoot(id), `source.${ext}`);

  const buf = Buffer.from(await request.arrayBuffer());

  if (chunkIndex === 0) {
    await writeFile(sourcePath, buf);
  } else {
    await appendFile(sourcePath, buf);
  }

  return NextResponse.json({
    ok: true,
    received: chunkIndex,
    total: chunkTotal,
    bytes: buf.length,
  });
}
