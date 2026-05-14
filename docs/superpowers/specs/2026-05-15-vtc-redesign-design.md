# video-to-claude — Capture Flow Redesign

**Status:** Approved design, awaiting implementation plan.
**Date:** 2026-05-15
**Scope:** Replace scene-detect + batch-extract pipeline with single timeline-capture flow that delivers annotated WebPs into the parent Claude Code conversation.

---

## 1. Motivation

Current flow forces a two-step pipeline (PySceneDetect → batch extract → grid select → separate annotation modal → send) that is unreliable and slow. Two pre-existing 500s in the project editor surface during normal use, and a Next.js Turbopack worker crash (`Jest worker encountered 2 child process exceptions`) is breaking the project view today.

User goal: open `/vtc` in Claude Code, drop a screen recording, scrub to interesting moments on a timeline, annotate inline, click Capture, click Send — and have annotated frames land directly in the active Claude Code conversation as vision input.

## 2. End-to-end flow

```
Claude Code: /vtc
        ↓
MCP start_capture_session
  ensure dev server up
  POST /api/sessions → sid
  open browser /capture/{sid}
MCP await_capture (long poll on session status)
        ↓
Browser /capture/{sid}
  state: empty   → UploadDropzone → POST /api/sessions/{sid}/source
  state: ready   → TimelinePlayer
                     scrub, draw on canvas overlay (arrow/rect/text/freehand)
                     click "Capture":
                       POST /api/sessions/{sid}/capture {t, shapes, displayW, displayH}
                       server: ffmpeg seek → PNG → sharp composite SVG → WebP
                       returns {idx, t, url}
                       canvas clears, thumb appended
                     click "Send (N)":
                       POST /api/sessions/{sid}/send → status=sent
  state: sent    → success screen
        ↓
MCP await_capture sees sent → reads WebPs → returns ImageContent[] + summary text
        ↓
Claude Code conversation: vision input arrives inline
```

## 3. Components

### 3.1 Frontend (new)
- `app/capture/[sessionId]/page.tsx` — orchestrates empty / ready / sent states; reads session on mount.
- `components/capture/TimelinePlayer.tsx` — `<video>` + `<canvas>` overlay + toolbar + scrub + capture button.
- `components/capture/CaptureStrip.tsx` — horizontal thumbnail strip with delete + seek-on-click.
- `components/UploadDropzone.tsx` — reused, points at `/api/sessions/{sid}/source`.

### 3.2 Frontend (deleted)
- `app/projects/[id]/page.tsx`
- `components/editor/` (EditorShell, Inspector, ExtractPanel, etc.)
- `components/FrameStrip.tsx`
- `components/AnnotationModal.tsx`

### 3.3 Backend (new)
- `POST /api/sessions` — create session, returns `{sessionId}`.
- `POST /api/sessions/[id]/source` — multipart upload, probe via ffmpeg-static, returns `{duration, width, height, fps}`.
- `POST /api/sessions/[id]/capture` — body `{t, shapes, displayW, displayH}` → frame + annotation pipeline → returns `{idx, t, url, bytes}`.
- `DELETE /api/sessions/[id]/captures/[idx]` — remove a capture.
- `POST /api/sessions/[id]/send` — set status=sent, freeze captures.
- `GET /api/sessions/[id]` — poll for MCP + UI cold-load resume.
- `GET /api/sessions/[id]/captures/[idx]` — serve WebP.

### 3.4 Backend (deleted)
- `app/api/projects/` entire tree.
- `python/` entire (PySceneDetect sidecar).
- `lib/scenes.ts`, batch extract logic.

### 3.5 Lib
- `lib/sessions.ts` — extend with capture CRUD + status transitions.
- `lib/probe.ts` — new, thin wrapper over ffmpeg-static probe.
- `lib/captureFrame.ts` — new, ffmpeg seek + sharp composite using existing `lib/annotateSvg.ts`.
- `lib/annotateSvg.ts` — keep as-is.

### 3.6 MCP
- Keep: `start_capture_session`, `await_capture`.
- Delete: `list_projects`, `upload_video`, `get_scenes`, `refine_scenes`, `extract_frames`, `get_frame_paths`, `get_snippet`, `preview_frame`, `analyze_with_claude`, `get_compressed_snippet`.

## 4. Data model

### 4.1 Session record (`data/sessions/{id}/meta.json`)

```json
{
  "id": "abc123",
  "status": "waiting | ready | sent",
  "createdAt": 1700000000,
  "source": {
    "name": "screen-rec.mp4",
    "ext": "mp4",
    "duration": 47.3,
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "captures": [
    {
      "idx": 1,
      "t": 12.4,
      "path": "D:/video-to-claude/data/sessions/abc123/captures/0001.webp",
      "shapes": [],
      "bytes": 184320
    }
  ],
  "sentAt": null
}
```

`source` is `null` while status=`waiting`.

### 4.2 Status transitions
- `waiting` → `ready` (after successful source upload + probe)
- `ready` → `sent` (after POST /send)
- Terminal: `sent`. No further mutations.

### 4.3 Disk layout

```
data/sessions/{id}/
  meta.json
  source.{mp4|webm|mov|mkv|avi}
  captures/
    0001.webp
    0002.webp
    ...
```

### 4.4 Capture naming
`{idx:04d}.webp`. Index assigned at capture time as `max(existing) + 1`, monotonic, never reused after delete (stable URLs).

### 4.5 Compression target
Match current `med` preset: max 960×540, q=80, cap 2 MB. SVG overlay composited at native resolution before sharp resize so arrows scale crisply.

## 5. Capture pipeline (per click)

### 5.1 Request

```ts
POST /api/sessions/{id}/capture
{
  t: 12.4,         // video.currentTime
  displayW: 1280,  // canvas pixel width as rendered
  displayH: 720,   // canvas pixel height
  shapes: Shape[]  // arrow | rect | text | freehand
}
```

### 5.2 Server steps

1. Load `meta.json`, verify status=`ready`.
2. Compute next `idx` (`max(captures.idx) + 1`, starting at 1).
3. ffmpeg-static single-frame extract:
   `ffmpeg -ss {t} -i source.{ext} -frames:v 1 -f image2pipe -vcodec png -` → PNG buffer.
4. Sharp pipeline:
   - `sharp(pngBuf)`
   - if `shapes.length > 0`: build SVG via `lib/annotateSvg.ts`, scaling display coordinates to native using `displayW/H` and source `width/height`.
   - `.composite([{ input: svgBuf, top: 0, left: 0 }])`
   - `.resize({ width: 960, withoutEnlargement: true })`
   - `.webp({ quality: 80 })`
   - Retry: if `bytes > 2_000_000` reduce quality by 5, repeat until ≤2 MB or quality ≤50.
5. Write `captures/{idx:04d}.webp`.
6. Append to `meta.captures`, save `meta.json`.
7. Return `{idx, t, url: "/api/sessions/{id}/captures/{idx}", bytes}`.

### 5.3 Failure modes
- ffmpeg fail → 400 with stderr tail.
- sharp fail → 500.
- Status ≠ `ready` → 409.

### 5.4 Concurrency
Captures POSTed serially from UI (button disabled while in-flight). No server-side lock. Worst case (two requests racing): one overwrite, user re-captures.

## 6. TimelinePlayer behavior

### 6.1 Layout (Stacked — selected during brainstorming)

```
┌─────────────────────────────────────────────────────┐
│ [→] [▭] [T] [✎]  [undo] [clear]      [● Capture]   │  toolbar
├─────────────────────────────────────────────────────┤
│                                                     │
│           <video> + <canvas overlay>                │  player (16:9 letterbox)
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⏵ 0:14 ●━━━━━━━━━○━━━━━━━━━━━━━━━━━ 0:42           │  scrub bar
├─────────────────────────────────────────────────────┤
│ [thumb1] [thumb2] [thumb3]            [Send (3) →] │  captures strip
└─────────────────────────────────────────────────────┘
```

### 6.2 Interactions
- Space = play/pause
- ← / → = seek ±0.1 s (Shift = frame-step ±1/fps)
- `c` = capture (shortcut)
- Click tool icon = switch tool (arrow default)
- Click+drag on canvas = draw active tool
- Esc = clear in-progress shape
- Backspace on focused strip thumb = delete capture

### 6.3 Canvas
- Sized to letterbox-fit video display.
- `pointer-events: auto` only when a draw tool is active; otherwise `none` so scrub/play controls remain interactive.
- After capture POST succeeds: shapes cleared, canvas blank, thumb appended with slide-in animation.

### 6.4 Captures strip
- Horizontal scroll, ~80×45 thumbs.
- Hover = timestamp + size tooltip.
- Click thumb = seek video to that `t` (no annotation restore in v1).
- × on hover = delete via DELETE route.

### 6.5 Send button
- Disabled when `captures.length === 0`.
- Label: `Send (N) →`.
- POST `/send`, transition to sent state on 200.

### 6.6 Sent state
Replaces player with green check + "N frames delivered. You may close this tab."

## 7. MCP delivery

### 7.1 Mechanism
MCP image content blocks — the only path from a Node process into Claude Code's vision context. Already implemented in `mcp/tools.ts`.

### 7.2 Flow
1. User types `/vtc` in Claude Code.
2. Slash command (`.claude/commands/vtc.md`) directs Claude to call `start_capture_session` → `await_capture` in sequence.
3. `start_capture_session`:
   - `ensureDevServer()` — boot `npm run dev` detached if port 3000 cold, poll 30 s.
   - POST `/api/sessions` → sid.
   - `openBrowser(/capture/{sid})` (platform-aware).
   - Return `{sessionId, url}` text.
4. Claude immediately calls `await_capture({sessionId, timeoutSec: 600})`.
5. Tool polls `GET /api/sessions/{sid}` every 1.5 s.
6. When `status === "sent"`:
   - Read each `capture.path` from disk → base64.
   - Return `[ImageContent..., TextContent("N frames received. Red arrows/boxes/text indicate the changes the user wants.")]`.
7. Claude Code receives tool result → vision model sees images.

### 7.3 Failure handling
- Timeout (default 600 s = 10 min): return text "timed out, re-run await_capture once user clicks Send". Claude can re-call.
- User closes browser pre-send: server keeps `meta.json`; user re-opens `/capture/{sid}` → state resumes from disk. URL stays valid until session deleted.
- Image > 5 MB: §5.4 compression loop caps at 2 MB, not reachable.
- Image count > 20: WebPs fine; warn in returned text. Hard cap 100.

### 7.4 Robustness improvements over current
- Default `timeoutSec` 300 → 600.
- UI cold-load reads `meta.json` and restores captures strip.
- `start_capture_session` returns explicit URL so user can manually reopen if window closes.

## 8. Error handling

### 8.1 Upload
- Non-video mime → 415.
- ffmpeg probe fail → 400 "could not probe". Session stays `waiting`.
- File > 500 MB → 413 (route config: `bodySizeLimit: "500mb"`).

### 8.2 Capture
- `t` out of range → 400.
- ffmpeg non-zero exit → log stderr tail, return 500. UI toast, strip preserved.
- sharp composite fail (bad SVG) → fallback: composite skipped, raw frame returned, warn logged.
- Multiple capture clicks while one in-flight → button disabled, no queue.

### 8.3 Send
- Status already `sent` → 409.
- Zero captures → 400.

### 8.4 MCP
- Port 3000 occupied → throw "port 3000 in use".
- `await_capture` fetch fail mid-poll → retry. After 5 consecutive fails → bail with text result.

### 8.5 Disk hygiene
- Sessions older than 7 days auto-deleted on next session creation (sweep).
- Manual clear: `DELETE /api/sessions/{sid}`.

### 8.6 Browser
- Video codec rejected → "unsupported codec" UI message.
- Canvas size 0 (not yet mounted) → no-op draw.

## 9. Testing

### 9.1 Unit (Vitest)
- `lib/annotateSvg.ts` — coord scaling + shape→SVG output.
- `lib/captureFrame.ts` — ffmpeg seek + sharp pipeline + size-retry loop. Mock ffmpeg with fixture PNG.
- `lib/sessions.ts` — CRUD on `meta.json`, idx assignment, status transitions.

### 9.2 API
- `POST /api/sessions` → returns sid, writes meta.
- `POST /sessions/[id]/source` → probe + meta update; reject bad mime.
- `POST /sessions/[id]/capture` → fixture mp4, t=1.0, no shapes → WebP under 2 MB, meta appended.
- `POST /sessions/[id]/send` → flip status; second call 409.
- `GET /sessions/[id]` → response shape.

### 9.3 E2E (Playwright)
- Upload fixture mp4 → captures page loads with player.
- Capture 3 frames at different `t` → strip shows 3 thumbs.
- Draw arrow → capture → fetched WebP has red arrow (pixel sample).
- Send → sent state.
- Restart server mid-flow → reload `/capture/{sid}` → strip restored.

### 9.4 MCP
- Manual smoke: `/vtc` in scratch Claude Code session → upload → capture → send → confirm images arrive inline.
- Automated MCP testing not feasible without harness; rely on e2e + manual.

### 9.5 Fixtures
- `tests/fixtures/sample.mp4` — 5 s 1080p test video (~200 KB), committed.

## 10. Migration

Breaking change. No backward compat for old `data/projects/` data. Acceptable per user direction.

### 10.1 Order
1. Add `lib/probe.ts`, `lib/captureFrame.ts`, extend `lib/sessions.ts`.
2. Add new API routes (`source`, `capture`, `captures/[idx]`, `send`).
3. Add `components/capture/TimelinePlayer.tsx`, `CaptureStrip.tsx`.
4. Replace `app/capture/[sessionId]/page.tsx`.
5. Manual smoke via `npm run dev`.
6. Trim `mcp/tools.ts` to `start_capture_session` + `await_capture`; rebuild.
7. Delete old code: `app/projects/`, `app/api/projects/`, `python/`, `components/editor/`, `components/FrameStrip.tsx`, `AnnotationModal.tsx`, `lib/scenes.ts`.
8. Update `CLAUDE.md` blueprint: drop scene/segment language + PySceneDetect.
9. Wipe `data/projects/` (gitignored).
10. README + snippet template updates.

### 10.2 Verification gate
Full e2e pass + manual `/vtc` round-trip before merging step 7 (deletes).

### 10.3 Rollback
`git revert`. Old code preserved in history.

## 11. Out of scope

- Multi-user / auth.
- Cloud storage; everything stays on local disk.
- Annotation re-edit after capture (v2; shapes are stored in meta for future use).
- Drag-to-reorder captures strip (v2).
- Mobile / touch optimization.
- Per-timestamp annotation memory on scrub-back (v2).
