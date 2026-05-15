import { describe, it, expect } from "vitest";
import path from "path";
import { probeVideo } from "@/lib/probe";

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "sample.mp4");

describe("probeVideo", () => {
  it("returns duration/width/height/fps for a valid mp4", async () => {
    const meta = await probeVideo(FIXTURE);
    expect(meta.duration).toBeCloseTo(5, 0);
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
    expect(meta.fps).toBeCloseTo(30, 0);
  });

  it("throws on a missing file", async () => {
    await expect(probeVideo("/nonexistent.mp4")).rejects.toThrow();
  });
});
