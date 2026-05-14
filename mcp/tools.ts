import { readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { apiGet, apiPost, apiPostFormData, apiGetText, apiGetBinary } from "./client.js";

type ToolContent = { content: [{ type: "text"; text: string }] };

function textResult(text: string): ToolContent {
  return { content: [{ type: "text", text }] };
}

interface StatusData {
  status: string;
  progress: number;
  error?: string;
}

interface ProjectManifest {
  projectId: string;
  sourceName: string;
  scenes: Array<{
    id: number;
    start: number;
    end: number;
    label?: string;
    segments: Array<{
      id: number;
      frames: Array<{
        idx: number;
        path: string;
        t: number;
        width: number;
        height: number;
        bytes: number;
      }>;
    }>;
  }>;
}

interface ProjectStateResponse {
  id: string;
  status: StatusData;
  manifest?: ProjectManifest;
}

// We extend Tool with a typed handler
interface McpTool extends Tool {
  handler(args: Record<string, unknown>): Promise<ToolContent>;
}

export const tools: McpTool[] = [
  // ── 1. list_projects ────────────────────────────────────────────────────────
  {
    name: "list_projects",
    description: "List all processed video projects.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    async handler(_args) {
      const projects = await apiGet<unknown[]>("/api/projects");
      return textResult(JSON.stringify(projects, null, 2));
    },
  },

  // ── 2. upload_video ─────────────────────────────────────────────────────────
  {
    name: "upload_video",
    description: "Upload a local video file by absolute path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the video file" },
        name: { type: "string", description: "Optional display name" },
      },
      required: ["path"],
    },
    async handler(args) {
      const filePath = args.path as string;
      const name = (args.name as string | undefined) ?? path.basename(filePath);
      const buffer = readFileSync(filePath);
      const blob = new Blob([buffer]);
      const form = new FormData();
      form.append("video", blob, name);
      const result = await apiPostFormData<{ projectId: string }>("/api/projects", form);
      return textResult(JSON.stringify({ projectId: result.projectId, message: "Upload started. Use get_scenes or extract_frames to monitor progress." }));
    },
  },

  // ── 3. get_scenes ───────────────────────────────────────────────────────────
  {
    name: "get_scenes",
    description: "Get the detected scene list for a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
      },
      required: ["projectId"],
    },
    async handler(args) {
      const projectId = args.projectId as string;
      const scenes = await apiGet<unknown>(`/api/projects/${projectId}/scenes`);
      return textResult(JSON.stringify(scenes, null, 2));
    },
  },

  // ── 4. refine_scenes ────────────────────────────────────────────────────────
  {
    name: "refine_scenes",
    description: "Save a refined scene list for a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
        scenes: {
          type: "array",
          description: "Array of scene objects",
          items: {
            type: "object",
            properties: {
              start: { type: "number" },
              end: { type: "number" },
              label: { type: "string" },
            },
            required: ["start", "end"],
          },
        },
      },
      required: ["projectId", "scenes"],
    },
    async handler(args) {
      const projectId = args.projectId as string;
      const scenes = args.scenes as Array<{ start: number; end: number; label?: string }>;
      const result = await apiPost<unknown>(`/api/projects/${projectId}/scenes`, { scenes });
      return textResult(JSON.stringify(result));
    },
  },

  // ── 5. extract_frames ───────────────────────────────────────────────────────
  {
    name: "extract_frames",
    description: "Extract frames for a project. Blocks until extraction completes (max 10 minutes).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
        sceneIds: {
          type: "array",
          description: "Optional list of scene IDs to extract",
          items: { type: "number" },
        },
        fps: { type: "number", description: "Frames per second to extract" },
        quality: { type: "string", description: "Quality setting (e.g. 'low', 'medium', 'high')" },
      },
      required: ["projectId"],
    },
    async handler(args) {
      const projectId = args.projectId as string;
      const sceneIds = args.sceneIds as number[] | undefined;
      const fps = args.fps as number | undefined;
      const quality = args.quality as string | undefined;

      // Start extraction
      await apiPost<unknown>(`/api/projects/${projectId}/extract`, {
        sceneIds,
        fps,
        quality,
      });

      // Poll until done or error (max 300 polls × 2s = 10 min)
      const MAX_POLLS = 300;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        const status = await apiGet<StatusData>(`/api/projects/${projectId}/status`);
        if (status.status === "done") break;
        if (status.status === "error") {
          throw new Error(`Extraction failed: ${status.error ?? "unknown error"}`);
        }
      }

      // Return manifest
      const project = await apiGet<ProjectStateResponse>(`/api/projects/${projectId}`);
      return textResult(JSON.stringify(project.manifest ?? { message: "Extraction complete but manifest not available." }, null, 2));
    },
  },

  // ── 6. get_frame_paths ──────────────────────────────────────────────────────
  {
    name: "get_frame_paths",
    description: "Get absolute paths to extracted frames, optionally filtered by sceneId/segId.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
        sceneId: { type: "number", description: "Optional scene ID filter" },
        segId: { type: "number", description: "Optional segment ID filter" },
      },
      required: ["projectId"],
    },
    async handler(args) {
      const projectId = args.projectId as string;
      const sceneId = args.sceneId as number | undefined;
      const segId = args.segId as number | undefined;

      const project = await apiGet<ProjectStateResponse>(`/api/projects/${projectId}`);
      const manifest = project.manifest;
      if (!manifest) {
        throw new Error("No frames manifest found — run extract_frames first.");
      }

      const paths: string[] = [];
      for (const scene of manifest.scenes) {
        if (sceneId !== undefined && scene.id !== sceneId) continue;
        for (const seg of scene.segments) {
          if (segId !== undefined && seg.id !== segId) continue;
          for (const frame of seg.frames) {
            paths.push(frame.path);
          }
        }
      }

      return textResult(paths.join("\n"));
    },
  },

  // ── 7. get_snippet ──────────────────────────────────────────────────────────
  {
    name: "get_snippet",
    description: "Get a ready-to-paste Claude Code prompt snippet for the project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
        sceneId: { type: "number", description: "Optional scene ID" },
        segId: { type: "number", description: "Optional segment ID" },
      },
      required: ["projectId"],
    },
    async handler(args) {
      const projectId = args.projectId as string;
      const sceneId = args.sceneId as number | undefined;
      const segId = args.segId as number | undefined;

      const params = new URLSearchParams();
      if (sceneId !== undefined) params.set("scene", String(sceneId));
      if (segId !== undefined) params.set("seg", String(segId));
      const query = params.toString() ? `?${params.toString()}` : "";

      const text = await apiGetText(`/api/projects/${projectId}/snippet${query}`);
      return textResult(text);
    },
  },

  // ── 8. preview_frame ────────────────────────────────────────────────────────
  {
    name: "preview_frame",
    description: "Get a single frame at a timestamp (seconds). Returns the absolute path to a saved JPEG.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
        t: { type: "number", description: "Timestamp in seconds" },
      },
      required: ["projectId", "t"],
    },
    async handler(args) {
      const projectId = args.projectId as string;
      const t = args.t as number;

      const buffer = await apiGetBinary(`/api/projects/${projectId}/preview?t=${t}`);
      const outPath = path.join(os.tmpdir(), `vtc_preview_${projectId}_${t}.jpg`);
      writeFileSync(outPath, Buffer.from(buffer));
      return textResult(outPath);
    },
  },
];
