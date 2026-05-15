import { NextRequest, NextResponse } from "next/server";
import { markSent } from "@/lib/captureSession";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const s = await markSent(id);
    return NextResponse.json(s);
  } catch (e) {
    const msg = (e as Error).message;
    if (/already sent/i.test(msg)) return NextResponse.json({ error: msg }, { status: 409 });
    if (/no captures/i.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
