import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

import { projectDir } from "@/lib/paths";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      id: string;
      scene: string;
      seg: string;
      file: string;
    }>;
  }
): Promise<NextResponse> {
  const { id, scene, seg, file } = await context.params;

  const filePath = path.join(projectDir(id), "frames", scene, seg, file);

  let data: Buffer;
  try {
    data = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { "Content-Type": "image/webp" },
  });
}
