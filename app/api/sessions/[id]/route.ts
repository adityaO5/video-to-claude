import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/captureSession";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(s);
}
