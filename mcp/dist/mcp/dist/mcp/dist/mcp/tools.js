"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = void 0;
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const client_js_1 = require("./client.js");
function textResult(text) {
    return { content: [{ type: "text", text }] };
}
exports.tools = [
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
            const projects = await (0, client_js_1.apiGet)("/api/projects");
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
            const filePath = args.path;
            const name = args.name ?? path_1.default.basename(filePath);
            const buffer = (0, fs_1.readFileSync)(filePath);
            const blob = new Blob([buffer]);
            const form = new FormData();
            form.append("video", blob, name);
            const result = await (0, client_js_1.apiPostFormData)("/api/projects", form);
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
            const projectId = args.projectId;
            const scenes = await (0, client_js_1.apiGet)(`/api/projects/${projectId}/scenes`);
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
            const projectId = args.projectId;
            const scenes = args.scenes;
            const result = await (0, client_js_1.apiPost)(`/api/projects/${projectId}/scenes`, { scenes });
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
            const projectId = args.projectId;
            const sceneIds = args.sceneIds;
            const fps = args.fps;
            const quality = args.quality;
            // Start extraction
            await (0, client_js_1.apiPost)(`/api/projects/${projectId}/extract`, {
                sceneIds,
                fps,
                quality,
            });
            // Poll until done or error (max 300 polls × 2s = 10 min)
            const MAX_POLLS = 300;
            for (let i = 0; i < MAX_POLLS; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                const status = await (0, client_js_1.apiGet)(`/api/projects/${projectId}/status`);
                if (status.status === "done")
                    break;
                if (status.status === "error") {
                    throw new Error(`Extraction failed: ${status.error ?? "unknown error"}`);
                }
            }
            // Return manifest
            const project = await (0, client_js_1.apiGet)(`/api/projects/${projectId}`);
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
            const projectId = args.projectId;
            const sceneId = args.sceneId;
            const segId = args.segId;
            const project = await (0, client_js_1.apiGet)(`/api/projects/${projectId}`);
            const manifest = project.manifest;
            if (!manifest) {
                throw new Error("No frames manifest found — run extract_frames first.");
            }
            const paths = [];
            for (const scene of manifest.scenes) {
                if (sceneId !== undefined && scene.id !== sceneId)
                    continue;
                for (const seg of scene.segments) {
                    if (segId !== undefined && seg.id !== segId)
                        continue;
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
            const projectId = args.projectId;
            const sceneId = args.sceneId;
            const segId = args.segId;
            const params = new URLSearchParams();
            if (sceneId !== undefined)
                params.set("scene", String(sceneId));
            if (segId !== undefined)
                params.set("seg", String(segId));
            const query = params.toString() ? `?${params.toString()}` : "";
            const text = await (0, client_js_1.apiGetText)(`/api/projects/${projectId}/snippet${query}`);
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
            const projectId = args.projectId;
            const t = args.t;
            const buffer = await (0, client_js_1.apiGetBinary)(`/api/projects/${projectId}/preview?t=${t}`);
            const outPath = path_1.default.join(os_1.default.tmpdir(), `vtc_preview_${projectId}_${t}.jpg`);
            (0, fs_1.writeFileSync)(outPath, Buffer.from(buffer));
            return textResult(outPath);
        },
    },
];
