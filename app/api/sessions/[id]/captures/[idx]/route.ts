import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSession, deleteCapture, capturesDir } from "@/lib/captureSession";

export const runtime = "nodejs";

function fileFor(id: string, idx: number) {
  return path.join(capturesDir(id), `${String(idx).padStart(4, "0")}.webp`);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string; idx: string }> }
) {
  const { id, idx } = await context.params;
  const n = Number(idx);
  if (!Number.isInteger(n)) {
    return NextResponse.json({ error: "Invalid idx" }, { status: 400 });
  }
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const found = s.captures.find((c) => c.idx === n);
  if (!found) return NextResponse.json({ error: "Capture not found" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(fileFor(id, n));
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 410 });
  }
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; idx: string }> }
) {
  const { id, idx } = await context.params;
  const n = Number(idx);
  if (!Number.isInteger(n)) {
    return NextResponse.json({ error: "Invalid idx" }, { status: 400 });
  }
  try {
    const updated = await deleteCapture(id, n);
    if (!updated) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
