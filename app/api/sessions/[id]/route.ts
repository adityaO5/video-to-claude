import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSession, capturesDir, sessionRoot } from "@/lib/captureSession";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (id === "_ping" || id === "ping")
    return NextResponse.json({ ok: true, app: "video-to-claude" });
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...s,
    capturesPath: path.resolve(capturesDir(id)),
    sessionPath: path.resolve(sessionRoot(id)),
  });
}
