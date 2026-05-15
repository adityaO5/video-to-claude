import { readFile } from "fs/promises";
import { exec, spawn } from "child_process";
import path from "path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { apiGet, apiPost } from "./client.js";
import { state } from "./state.js";

const VTC_ROOT = path.resolve(__dirname, "..", "..", "..");

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
type ToolContent = { content: Array<TextContent | ImageContent> };

function textResult(text: string): ToolContent {
  return { content: [{ type: "text", text }] };
}

interface CaptureRecord {
  idx: number;
  t: number;
  path: string;
  bytes: number;
  compressedPath?: string;
  compressedBytes?: number;
}

interface CompressionStats {
  originalTotalBytes: number;
  compressedTotalBytes: number;
  savedBytes: number;
  count: number;
}

interface SessionRecord {
  id: string;
  status: "waiting" | "ready" | "sent";
  captures: CaptureRecord[];
  compressionStats?: CompressionStats;
}

const SCAN_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];

async function findOurServer(): Promise<string | null> {
  for (const port of SCAN_PORTS) {
    try {
      const url = `http://localhost:${port}`;
      const res = await fetch(`${url}/api/sessions/_ping`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        if (json.app === "video-to-claude") return url;
      }
    } catch {
      // port not our app
    }
  }
  return null;
}

async function ensureDevServer(): Promise<void> {
  const found = await findOurServer();
  if (found) {
    state.baseUrl = found;
    return;
  }
  const child = spawn("npm", ["run", "dev"], {
    cwd: VTC_ROOT,
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 1500));
    const active = await findOurServer();
    if (active) {
      state.baseUrl = active;
      return;
    }
  }
  throw new Error("Dev server did not start within 30 seconds");
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "win32") exec(`start "" "${url}"`);
  else if (platform === "darwin") exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}

interface McpTool extends Tool {
  handler(args: Record<string, unknown>): Promise<ToolContent>;
}

export const tools: McpTool[] = [
  {
    name: "start_capture_session",
    description:
      "Boot the video-to-claude UI (auto-starts dev server if not running), create a capture session, open the browser. " +
      "Returns the sessionId; pass it to await_capture and wait for the user to upload + capture + send.",
    inputSchema: { type: "object", properties: {}, required: [] },
    async handler(_args) {
      await ensureDevServer();
      const created = await apiPost<{ sessionId: string }>("/api/sessions", {});
      const sessionId = created.sessionId;
      const url = `${state.baseUrl}/capture/${sessionId}`;
      openBrowser(url);
      return textResult(
        `Capture session started.\n` +
          `Session ID: ${sessionId}\n` +
          `URL: ${url}\n\n` +
          `Now call await_capture with sessionId="${sessionId}" and wait while the user uploads a video, ` +
          `scrubs the timeline, annotates with arrows/boxes/text, clicks Capture, and clicks Send.`
      );
    },
  },
  {
    name: "await_capture",
    description:
      "Wait until the user clicks Send in the capture UI, then return all annotated frames as image content blocks. " +
      "Polls every 1.5 s. Default timeout 600 s.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        timeoutSec: { type: "number" },
      },
      required: ["sessionId"],
    },
    async handler(args) {
      const sessionId = args.sessionId as string;
      const timeoutSec = (args.timeoutSec as number | undefined) ?? 600;
      const deadline = Date.now() + timeoutSec * 1000;
      let consecutiveFetchFails = 0;
      while (Date.now() < deadline) {
        await new Promise<void>((r) => setTimeout(r, 1500));
        let session: SessionRecord;
        try {
          session = await apiGet<SessionRecord>(`/api/sessions/${sessionId}`);
          consecutiveFetchFails = 0;
        } catch {
          consecutiveFetchFails++;
          if (consecutiveFetchFails >= 5) {
            return textResult(
              `Lost contact with dev server while polling ${sessionId}. Re-run await_capture once the server is back.`
            );
          }
          continue;
        }
        if (session.status === "sent" && session.captures.length > 0) {
          const content: Array<TextContent | ImageContent> = [];
          for (const c of session.captures) {
            const filePath = c.compressedPath ?? c.path;
            try {
              const buf = await readFile(filePath);
              content.push({
                type: "image",
                data: buf.toString("base64"),
                mimeType: "image/webp",
              });
            } catch {
              // skip unreadable file
            }
          }
          const stats = session.compressionStats;
          const statsNote = stats
            ? ` (compressed ${(stats.originalTotalBytes / 1024).toFixed(0)} KB → ${(stats.compressedTotalBytes / 1024).toFixed(0)} KB, saved ${(stats.savedBytes / 1024).toFixed(0)} KB)`
            : "";
          content.push({
            type: "text",
            text:
              `Received ${content.length} annotated frame(s) from session ${sessionId}${statsNote}. ` +
              `Red arrows, boxes, text labels, and freehand marks indicate the changes the user wants — read them visually and apply.`,
          });
          return { content };
        }
      }
      return textResult(
        `Timed out waiting for session ${sessionId} after ${timeoutSec}s. ` +
          `Re-run await_capture once the user clicks Send.`
      );
    },
  },
];
