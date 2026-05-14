import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";
import { projectDir } from "@/lib/paths";

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const dir = projectDir(id);

  // Find source file
  let sourcePath: string | null = null;
  try {
    const files = await readdir(dir);
    const sourceFile = files.find((f) => f.startsWith("source."));
    if (sourceFile) sourcePath = path.join(dir, sourceFile);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!sourcePath) {
    return NextResponse.json({ error: "Source video not found" }, { status: 404 });
  }

  const ext = path.extname(sourcePath).slice(1).toLowerCase();
  const contentType = MIME[ext] ?? "video/mp4";

  const fileStat = await stat(sourcePath);
  const fileSize = fileStat.size;

  const rangeHeader = request.headers.get("range");

  if (!rangeHeader) {
    // Full file response
    const stream = createReadStream(sourcePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Parse Range header: "bytes=start-end"
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    return new Response("Invalid Range", { status: 416 });
  }

  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  const chunkSize = end - start + 1;

  if (start > end || end >= fileSize) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const stream = createReadStream(sourcePath, { start, end });
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new Response(webStream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    },
  });
}
