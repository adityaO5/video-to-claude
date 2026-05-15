# video-to-claude — Claude Code Blueprint

## Purpose
Drop a screen recording, scrub a timeline, annotate frames inline, click Capture, click Send — and the annotated WebPs land in the parent Claude Code conversation as vision input.

## Vision Constraints (encode in all logic)
- Formats: PNG, JPEG, WebP (we emit WebP).
- Per-image hard cap 5 MB; we target ≤2 MB and downsize via quality retry.
- Max dimensions 8000×8000 px; we emit ≤960 px wide (med preset).
- Per-request soft cap ~100 images; auto-downscale beyond 20.

## Architecture
- Next.js 16 App Router (Node 24) — UI + HTTP API on localhost:3000.
- `ffmpeg-static` — probe metadata + seek-extract single frames.
- `sharp` — composite SVG annotations + WebP encode with retry.
- MCP stdio server (`mcp/`) — registered by Claude Code; exposes `start_capture_session` + `await_capture`.

## Single-Page Flow
1. User types `/vtc` in Claude Code → MCP `start_capture_session` boots dev server if needed, opens `/capture/{sid}`.
2. User drops a video → POST `/api/sessions/{sid}/source` → probed, status → `ready`.
3. User scrubs `<video>`, draws on the canvas overlay, clicks Capture → POST `/api/sessions/{sid}/capture` → ffmpeg + sharp produce a WebP with the annotations baked in.
4. User clicks Send → POST `/api/sessions/{sid}/send` → status → `sent`.
5. MCP `await_capture` polls, sees `sent`, returns the WebPs as image content blocks to the parent conversation.

## Data Layout
```
data/sessions/{id}/
  meta.json              # {id, status, source, captures[], sentAt}
  source.mp4             # uploaded video
  captures/
    0001.webp
    0002.webp
```

## Quality Targets
- Default: max width 960 px, q=80, cap 2 MB. Retry by stepping quality down 5 until ≤2 MB or q=50.

## MCP Tools
- `start_capture_session` — ensure dev server, create session, open browser. Returns `sessionId`.
- `await_capture` — long-poll until `status=sent`; returns annotated WebPs as image content blocks.

## Status Values
`waiting` → `ready` → `sent`.

## What's Not Here Anymore
The old scene-detect + batch-extract pipeline (PySceneDetect Python sidecar, `data/projects/`, scene/segment hierarchy, scene refinement, batch annotation modal) was removed in the 2026-05-15 timeline-capture redesign. See `docs/superpowers/specs/2026-05-15-vtc-redesign-design.md`.
