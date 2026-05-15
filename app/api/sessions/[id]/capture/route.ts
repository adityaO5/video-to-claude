import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  getSession,
  addCapture,
  nextCaptureIdx,
  capturesDir,
  sessionRoot,
} from "@/lib/captureSession";
import { captureAnnotatedFrame } from "@/lib/captureFrame";
import type { Shape } from "@/lib/annotateSvg";

export const runtime = "nodejs";

interface CaptureBody {
  t: number;
  displayW: number;
  displayH: number;
  shapes: Shape[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (s.status !== "ready") {
    return NextResponse.json(
      { error: `Session status is ${s.status}, expected 'ready'` },
      { status: 409 }
    );
  }
  if (!s.source) {
    return NextResponse.json({ error: "Source missing" }, { status: 409 });
  }

  const body = (await request.json()) as CaptureBody;
  if (typeof body.t !== "number" || body.t < 0 || body.t > s.source.duration + 0.5) {
    return NextResponse.json(
      { error: `t=${body.t} out of range [0, ${s.source.duration}]` },
      { status: 400 }
    );
  }

  const idx = await nextCaptureIdx(id);
  const outPath = path.join(capturesDir(id), `${String(idx).padStart(4, "0")}.webp`);
  const sourcePath = path.join(sessionRoot(id), `source.${s.source.ext}`);

  let result;
  try {
    result = await captureAnnotatedFrame({
      sourcePath,
      t: body.t,
      shapes: body.shapes ?? [],
      displayW: body.displayW,
      displayH: body.displayH,
      sourceWidth: s.source.width,
      sourceHeight: s.source.height,
      outPath,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const capture = await addCapture(id, {
    idx,
    t: body.t,
    path: result.outPath,
    bytes: result.bytes,
    shapes: body.shapes ?? [],
  });

  return NextResponse.json({
    idx: capture.idx,
    t: capture.t,
    bytes: capture.bytes,
    url: `/api/sessions/${id}/captures/${capture.idx}`,
  });
}
