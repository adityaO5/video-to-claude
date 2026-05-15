import { readFile } from "fs/promises";
import { exec, spawn } from "child_process";
import path from "path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { apiGet, apiPost } from "./client.js";

const BASE_URL = process.env.VIDEO_TO_CLAUDE_URL ?? "http://localhost:3000";
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
}

interface SessionRecord {
  id: string;
  status: "waiting" | "ready" | "sent";
  captures: CaptureRecord[];
}

async function isDevServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/sessions/_ping`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function ensureDevServer(): Promise<void> {
  if (await isDevServerUp()) return;
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
    if (await isDevServerUp()) return;
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
      const url = `${BASE_URL}/capture/${sessionId}`;
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
            try {
              const buf = await readFile(c.path);
              content.push({
                type: "image",
                data: buf.toString("base64"),
                mimeType: "image/webp",
              });
            } catch {
              // skip unreadable file
            }
          }
          content.push({
            type: "text",
            text:
              `Received ${content.length} annotated frame(s) from session ${sessionId}. ` +
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
