import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { getSession, markSent, sessionRoot } from "@/lib/captureSession";
import { compressCapture, summarizeStats } from "@/lib/compress";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const s = await getSession(id);
    if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (s.status === "sent") return NextResponse.json({ error: "session already sent" }, { status: 409 });
    if (s.captures.length === 0) return NextResponse.json({ error: "no captures to send" }, { status: 400 });

    const count = s.captures.length;
    const compressionResults = [];
    const updatedCaptures = [];

    for (const cap of s.captures) {
      try {
        const result = await compressCapture(cap.path, count);
        compressionResults.push(result);
        updatedCaptures.push({
          ...cap,
          compressedPath: result.compressedPath,
          compressedBytes: result.compressedBytes,
        });
      } catch {
        // compression failed — keep original
        compressionResults.push({ compressedPath: cap.path, originalBytes: cap.bytes, compressedBytes: cap.bytes });
        updatedCaptures.push(cap);
      }
    }

    const compressionStats = summarizeStats(compressionResults);
    const updated = await markSent(id, { updatedCaptures, compressionStats });

    // Delete source video to free disk space — snippets remain on disk.
    // Non-fatal if it fails (file in use, already gone, etc.).
    if (s.source?.ext) {
      const sourcePath = path.join(sessionRoot(id), `source.${s.source.ext}`);
      await unlink(sourcePath).catch(() => { /* ignore */ });
    }

    return NextResponse.json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
