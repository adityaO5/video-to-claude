import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import { getSession, sessionRoot } from "@/lib/captureSession";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const s = await getSession(id);
  if (!s?.source) return NextResponse.json({ error: "No source" }, { status: 404 });

  const filePath = path.join(sessionRoot(id), `source.${s.source.ext}`);
  const fileStat = await stat(filePath);
  const fileSize = fileStat.size;
  const mime = MIME[s.source.ext] ?? "video/mp4";

  const range = request.headers.get("range");
  if (!range) {
    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600, must-revalidate",
      },
    });
  }
  const m = range.match(/bytes=(\d*)-(\d*)/);
  if (!m) return new Response("Invalid Range", { status: 416 });
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Number(m[2]) : fileSize - 1;
  if (start > end || end >= fileSize) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }
  const chunk = end - start + 1;
  const stream = createReadStream(filePath, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(chunk),
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600, must-revalidate",
    },
  });
}
