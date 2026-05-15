import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, app: "video-to-claude" });
}
