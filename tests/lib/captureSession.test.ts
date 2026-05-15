import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import path from "path";
import os from "os";
import {
  createSession,
  getSession,
  setSource,
  addCapture,
  deleteCapture,
  markSent,
  nextCaptureIdx,
  sessionRoot,
  __setSessionsRootForTests,
} from "@/lib/captureSession";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "vtc-sess-"));
  __setSessionsRootForTests(tmp);
});

describe("captureSession", () => {
  it("creates a waiting session", async () => {
    const s = await createSession();
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(s.status).toBe("waiting");
    expect(s.captures).toEqual([]);
    expect(s.source).toBeNull();
  });

  it("setSource probes + flips status to ready", async () => {
    const s = await createSession();
    const updated = await setSource(s.id, {
      name: "x.mp4",
      ext: "mp4",
      duration: 5,
      width: 1920,
      height: 1080,
      fps: 30,
    });
    expect(updated?.status).toBe("ready");
    expect(updated?.source?.duration).toBe(5);
  });

  it("addCapture assigns monotonic idx", async () => {
    const s = await createSession();
    await setSource(s.id, { name: "x", ext: "mp4", duration: 5, width: 1, height: 1, fps: 30 });
    const c1 = await addCapture(s.id, { t: 1, path: "/p/0001.webp", bytes: 100, shapes: [] });
    const c2 = await addCapture(s.id, { t: 2, path: "/p/0002.webp", bytes: 100, shapes: [] });
    expect(c1.idx).toBe(1);
    expect(c2.idx).toBe(2);
    const after = await deleteCapture(s.id, 1);
    expect(after?.captures.map((c) => c.idx)).toEqual([2]);
    const c3 = await addCapture(s.id, { t: 3, path: "/p/0003.webp", bytes: 100, shapes: [] });
    expect(c3.idx).toBe(3);
  });

  it("markSent flips status only when there is at least one capture", async () => {
    const s = await createSession();
    await setSource(s.id, { name: "x", ext: "mp4", duration: 5, width: 1, height: 1, fps: 30 });
    await expect(markSent(s.id)).rejects.toThrow(/no captures/i);
    await addCapture(s.id, { t: 1, path: "/p/0001.webp", bytes: 100, shapes: [] });
    const sent = await markSent(s.id);
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).toBeTypeOf("number");
    await expect(markSent(s.id)).rejects.toThrow(/already sent/i);
  });

  it("sessionRoot returns the directory under root", async () => {
    const s = await createSession();
    expect(sessionRoot(s.id)).toBe(path.join(tmp, s.id));
  });

  it("nextCaptureIdx is max+1 (1 when empty)", async () => {
    const s = await createSession();
    expect(await nextCaptureIdx(s.id)).toBe(1);
    await addCapture(s.id, { t: 1, path: "/p/0001.webp", bytes: 100, shapes: [] });
    expect(await nextCaptureIdx(s.id)).toBe(2);
  });
});
