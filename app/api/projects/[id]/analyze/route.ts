import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { projectDir, framesManifest } from "@/lib/paths";
import type { ProjectManifest } from "@/lib/manifest";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set. Add it to .env.local" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    sceneId?: number;
    segId?: number;
    prompt?: string;
  };

  // Load manifest
  let manifest: ProjectManifest;
  try {
    const raw = await readFile(framesManifest(id), "utf8");
    manifest = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "No frames extracted yet" }, { status: 400 });
  }

  // Collect frames to analyze
  const framePaths: string[] = [];
  for (const scene of manifest.scenes) {
    if (body.sceneId !== undefined && scene.id !== body.sceneId) continue;
    for (const seg of scene.segments) {
      if (body.segId !== undefined && seg.id !== body.segId) continue;
      for (const frame of seg.frames) {
        framePaths.push(frame.path);
      }
    }
  }

  if (framePaths.length === 0) {
    return NextResponse.json({ error: "No frames found for selection" }, { status: 400 });
  }

  // Cap at 20 frames to stay under auto-downscale threshold
  const capped = framePaths.slice(0, 20);

  // Load images as base64
  const imageContents: Anthropic.ImageBlockParam[] = await Promise.all(
    capped.map(async (p) => {
      const buf = await readFile(p);
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/webp" as const,
          data: buf.toString("base64"),
        },
      };
    })
  );

  const userPrompt =
    body.prompt ??
    `Analyze these ${capped.length} video frames in chronological order. ` +
      `Describe what is happening in the video, noting key changes between frames, ` +
      `UI states, user actions, and any notable events. Be concise and specific.`;

  // Call Anthropic API
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          ...imageContents,
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const analysis = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("\n");

  return NextResponse.json({
    analysis,
    model: response.model,
    frameCount: capped.length,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
}
