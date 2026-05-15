"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = void 0;
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const client_js_1 = require("./client.js");
const BASE_URL = process.env.VIDEO_TO_CLAUDE_URL ?? "http://localhost:3000";
const VTC_ROOT = path_1.default.resolve(__dirname, "..", "..", "..");
function textResult(text) {
    return { content: [{ type: "text", text }] };
}
async function isDevServerUp() {
    try {
        const res = await fetch(`${BASE_URL}/api/sessions/_ping`, {
            signal: AbortSignal.timeout(2000),
        });
        return res.status < 500;
    }
    catch {
        return false;
    }
}
async function ensureDevServer() {
    if (await isDevServerUp())
        return;
    const child = (0, child_process_1.spawn)("npm", ["run", "dev"], {
        cwd: VTC_ROOT,
        detached: true,
        stdio: "ignore",
        shell: true,
    });
    child.unref();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        if (await isDevServerUp())
            return;
    }
    throw new Error("Dev server did not start within 30 seconds");
}
function openBrowser(url) {
    const platform = process.platform;
    if (platform === "win32")
        (0, child_process_1.exec)(`start "" "${url}"`);
    else if (platform === "darwin")
        (0, child_process_1.exec)(`open "${url}"`);
    else
        (0, child_process_1.exec)(`xdg-open "${url}"`);
}
exports.tools = [
    {
        name: "start_capture_session",
        description: "Boot the video-to-claude UI (auto-starts dev server if not running), create a capture session, open the browser. " +
            "Returns the sessionId; pass it to await_capture and wait for the user to upload + capture + send.",
        inputSchema: { type: "object", properties: {}, required: [] },
        async handler(_args) {
            await ensureDevServer();
            const created = await (0, client_js_1.apiPost)("/api/sessions", {});
            const sessionId = created.sessionId;
            const url = `${BASE_URL}/capture/${sessionId}`;
            openBrowser(url);
            return textResult(`Capture session started.\n` +
                `Session ID: ${sessionId}\n` +
                `URL: ${url}\n\n` +
                `Now call await_capture with sessionId="${sessionId}" and wait while the user uploads a video, ` +
                `scrubs the timeline, annotates with arrows/boxes/text, clicks Capture, and clicks Send.`);
        },
    },
    {
        name: "await_capture",
        description: "Wait until the user clicks Send in the capture UI, then return all annotated frames as image content blocks. " +
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
            const sessionId = args.sessionId;
            const timeoutSec = args.timeoutSec ?? 600;
            const deadline = Date.now() + timeoutSec * 1000;
            let consecutiveFetchFails = 0;
            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 1500));
                let session;
                try {
                    session = await (0, client_js_1.apiGet)(`/api/sessions/${sessionId}`);
                    consecutiveFetchFails = 0;
                }
                catch {
                    consecutiveFetchFails++;
                    if (consecutiveFetchFails >= 5) {
                        return textResult(`Lost contact with dev server while polling ${sessionId}. Re-run await_capture once the server is back.`);
                    }
                    continue;
                }
                if (session.status === "sent" && session.captures.length > 0) {
                    const content = [];
                    for (const c of session.captures) {
                        try {
                            const buf = await (0, promises_1.readFile)(c.path);
                            content.push({
                                type: "image",
                                data: buf.toString("base64"),
                                mimeType: "image/webp",
                            });
                        }
                        catch {
                            // skip unreadable file
                        }
                    }
                    content.push({
                        type: "text",
                        text: `Received ${content.length} annotated frame(s) from session ${sessionId}. ` +
                            `Red arrows, boxes, text labels, and freehand marks indicate the changes the user wants — read them visually and apply.`,
                    });
                    return { content };
                }
            }
            return textResult(`Timed out waiting for session ${sessionId} after ${timeoutSec}s. ` +
                `Re-run await_capture once the user clicks Send.`);
        },
    },
];
