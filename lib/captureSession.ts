import path from "path";
import { existsSync } from "fs";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { nanoid } from "nanoid";
import type { Shape } from "@/lib/annotateSvg";

export type SessionStatus = "waiting" | "ready" | "sent";

export interface SessionSource {
  name: string;
  ext: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface Capture {
  idx: number;
  t: number;
  path: string;
  bytes: number;
  shapes: Shape[];
  compressedPath?: string;
  compressedBytes?: number;
}

export interface CompressionStats {
  originalTotalBytes: number;
  compressedTotalBytes: number;
  savedBytes: number;
  count: number;
}

export interface CaptureSession {
  id: string;
  status: SessionStatus;
  createdAt: number;
  source: SessionSource | null;
  captures: Capture[];
  sentAt: number | null;
  compressionStats?: CompressionStats;
}

let SESSIONS_ROOT = path.join(process.cwd(), "data", "sessions");

/** @internal */
export function __setSessionsRootForTests(root: string) {
  SESSIONS_ROOT = root;
}

export function sessionRoot(id: string): string {
  return path.join(SESSIONS_ROOT, id);
}

export function metaFile(id: string): string {
  return path.join(sessionRoot(id), "meta.json");
}

export function capturesDir(id: string): string {
  return path.join(sessionRoot(id), "captures");
}

async function readMeta(id: string): Promise<CaptureSession | null> {
  const fp = metaFile(id);
  if (!existsSync(fp)) return null;
  const raw = await readFile(fp, "utf8");
  return JSON.parse(raw) as CaptureSession;
}

async function writeMeta(s: CaptureSession): Promise<CaptureSession> {
  await mkdir(sessionRoot(s.id), { recursive: true });
  await writeFile(metaFile(s.id), JSON.stringify(s, null, 2));
  return s;
}

export async function createSession(): Promise<CaptureSession> {
  const id = nanoid(12);
  const s: CaptureSession = {
    id,
    status: "waiting",
    createdAt: Date.now(),
    source: null,
    captures: [],
    sentAt: null,
  };
  await mkdir(capturesDir(id), { recursive: true });
  return writeMeta(s);
}

export async function getSession(id: string): Promise<CaptureSession | null> {
  return readMeta(id);
}

export async function setSource(
  id: string,
  source: SessionSource
): Promise<CaptureSession | null> {
  const s = await readMeta(id);
  if (!s) return null;
  s.source = source;
  s.status = "ready";
  return writeMeta(s);
}

export async function nextCaptureIdx(id: string): Promise<number> {
  const s = await readMeta(id);
  if (!s) throw new Error("session not found");
  if (s.captures.length === 0) return 1;
  return Math.max(...s.captures.map((c) => c.idx)) + 1;
}

export async function addCapture(
  id: string,
  cap: Omit<Capture, "idx"> & { idx?: number }
): Promise<Capture> {
  const s = await readMeta(id);
  if (!s) throw new Error("session not found");
  if (s.status === "sent") throw new Error("session already sent");
  const idx =
    cap.idx ??
    (s.captures.length === 0
      ? 1
      : Math.max(...s.captures.map((c) => c.idx)) + 1);
  const full: Capture = {
    idx,
    t: cap.t,
    path: cap.path,
    bytes: cap.bytes,
    shapes: cap.shapes,
  };
  s.captures.push(full);
  await writeMeta(s);
  return full;
}

export async function deleteCapture(
  id: string,
  idx: number
): Promise<CaptureSession | null> {
  const s = await readMeta(id);
  if (!s) return null;
  if (s.status === "sent") throw new Error("session already sent");
  const target = s.captures.find((c) => c.idx === idx);
  if (target) {
    try {
      await rm(target.path, { force: true });
    } catch {}
  }
  s.captures = s.captures.filter((c) => c.idx !== idx);
  return writeMeta(s);
}

export async function markSent(
  id: string,
  opts?: { updatedCaptures?: Capture[]; compressionStats?: CompressionStats }
): Promise<CaptureSession> {
  const s = await readMeta(id);
  if (!s) throw new Error("session not found");
  if (s.status === "sent") throw new Error("session already sent");
  if (s.captures.length === 0) throw new Error("no captures to send");
  if (opts?.updatedCaptures) s.captures = opts.updatedCaptures;
  if (opts?.compressionStats) s.compressionStats = opts.compressionStats;
  s.status = "sent";
  s.sentAt = Date.now();
  return writeMeta(s);
}
