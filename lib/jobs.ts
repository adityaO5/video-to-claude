import { writeFile, readFile } from "fs/promises";
import { statusFile } from "./paths";

export type JobStatus =
  | "queued"
  | "probing"
  | "detecting"
  | "awaiting_refinement"
  | "extracting"
  | "done"
  | "error";

export interface StatusData {
  status: JobStatus;
  progress: number;
  error?: string;
}

// In-memory registry for active jobs
const jobs = new Map<string, StatusData>();

export async function writeStatus(
  projectId: string,
  data: StatusData
): Promise<void> {
  jobs.set(projectId, data);
  const json = JSON.stringify(data, null, 2);
  await writeFile(statusFile(projectId), json, "utf8");
}

export async function readStatus(projectId: string): Promise<StatusData | null> {
  // Check memory first
  const mem = jobs.get(projectId);
  if (mem) return mem;
  // Fall back to disk
  try {
    const raw = await readFile(statusFile(projectId), "utf8");
    const data = JSON.parse(raw) as StatusData;
    return data;
  } catch {
    return null;
  }
}

export function setProgress(projectId: string, status: JobStatus, progress: number) {
  const current = jobs.get(projectId);
  const next: StatusData = { ...(current ?? {}), status, progress };
  jobs.set(projectId, next);
  // Fire-and-forget disk write (don't await in hot paths)
  writeFile(statusFile(projectId), JSON.stringify(next, null, 2), "utf8").catch(() => {});
}
