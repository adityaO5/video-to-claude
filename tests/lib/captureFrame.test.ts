import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { mkdir } from "fs/promises";
import { captureAnnotatedFrame } from "@/lib/captureFrame";

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "sample.mp4");
const OUTDIR = path.join(process.cwd(), "tests", "tmp", "captureFrame");

beforeAll(async () => {
  await mkdir(OUTDIR, { recursive: true });
});

describe("captureAnnotatedFrame", () => {
  it("extracts a single frame and writes a WebP under 2 MB without shapes", async () => {
    const out = path.join(OUTDIR, "no-shapes.webp");
    const result = await captureAnnotatedFrame({
      sourcePath: FIXTURE,
      t: 1.0,
      shapes: [],
      displayW: 1920,
      displayH: 1080,
      sourceWidth: 1920,
      sourceHeight: 1080,
      outPath: out,
    });
    expect(result.bytes).toBeGreaterThan(1000);
    expect(result.bytes).toBeLessThan(2_000_000);
  });

  it("composites an arrow when shapes are provided", async () => {
    const out = path.join(OUTDIR, "with-arrow.webp");
    const result = await captureAnnotatedFrame({
      sourcePath: FIXTURE,
      t: 2.0,
      shapes: [{ type: "arrow", x1: 100, y1: 100, x2: 500, y2: 500 }],
      displayW: 1920,
      displayH: 1080,
      sourceWidth: 1920,
      sourceHeight: 1080,
      outPath: out,
    });
    expect(result.bytes).toBeGreaterThan(1000);
  });

  it("rejects t out of range", async () => {
    const out = path.join(OUTDIR, "oob.webp");
    await expect(
      captureAnnotatedFrame({
        sourcePath: FIXTURE,
        t: 999,
        shapes: [],
        displayW: 1920,
        displayH: 1080,
        sourceWidth: 1920,
        sourceHeight: 1080,
        outPath: out,
      })
    ).rejects.toThrow();
  });
});
