# video-to-claude — Claude Code Blueprint

## Purpose
Convert local video files into compressed WebP frame images optimized for Claude Code vision.
Claude Code never sees raw video — only WebP images and file paths.

## Claude Vision Constraints (encode these in all logic)
- Supported formats: PNG, JPEG, WebP (use WebP — best size/quality)
- Max file size: 5 MB per image (hard limit). Target < 1.5 MB, cap at 2 MB.
- Max dimensions: 8000×8000 px hard limit. Default output: 960×540 (med quality preset).
- Per-request image limit: ~100 images max. Auto-downscaled to 2000×2000 if >20 images in one request.
- BATCH SIZE: keep segments ≤ 25 frames each.

## Architecture
- Next.js 15 App Router (TS, Node 24) — UI + HTTP API on localhost:3000
- Python sidecar — PySceneDetect for scene boundary detection
- ffmpeg-static — probe video metadata + extract raw PNG frames
- sharp — compress PNG → WebP with quality retry loop
- MCP server (mcp/) — stdio server Claude Code registers for tool-based pipeline orchestration

## Two-Step Pipeline
1. Upload → Probe (ffmpeg) → Detect scenes (PySceneDetect) → awaiting_refinement
2. User refines scene list → Extract frames → Compress → Segment → done

## Data Layout
```
data/projects/{id}/
  source.mp4          # uploaded video
  status.json         # {status, progress, error}
  probe.json          # {duration, fps, width, height, codec}
  scenes.json         # detected (+ optionally refined) scenes
  frames.json         # extraction manifest
  frames.md           # human-readable index
  snippet.txt         # default Claude Code copy-paste prompt
  frames/
    scene_000/
      seg_000/
        f0001_00m05s.webp
```

## Quality Presets
- low:  640×360,  q=70, cap 2 MB
- med:  960×540,  q=80, cap 2 MB (default)
- high: 1280×720, q=85, cap 3 MB

## MCP Tools (see mcp/)
list_projects, upload_video, get_scenes, refine_scenes, extract_frames, get_frame_paths, get_snippet, preview_frame

## Status Values
queued → probing → detecting → awaiting_refinement → extracting → done | error
