import { NextResponse } from "next/server";
import { createSession } from "@/lib/captureSession";

export async function POST() {
  const s = await createSession();
  return NextResponse.json(
    { sessionId: s.id, status: s.status },
    { status: 201 }
  );
}
