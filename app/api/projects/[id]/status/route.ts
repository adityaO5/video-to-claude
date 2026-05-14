import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";

import { statusFile } from "@/lib/paths";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    const raw = await readFile(statusFile(id), "utf8");
    const data = JSON.parse(raw) as unknown;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Status not found" }, { status: 404 });
  }
}
