# video-to-claude — Plan

## Context

Local tool that turn video into compressed, well-named frame images optimized for Claude Code vision. Claude Code never see video — only WebP/JPEG/PNG under ~5MB, ≤8000px, batches ≤20 to avoid 2000×2000 auto-downscale. App = deterministic "video → frame set" compiler.

Two surfaces:
1. **Web UI** — human upload, review scenes, refine, extract.
2. **MCP server** — Claude Code calls same pipeline as tools, gets frame paths back, attaches into its session automatically.

Greenfield. Empty dir `D:\video-to-claude`. Local-only.

## Stack

- **Next.js 15 App Router** (TS, Node 24) — UI + HTTP API
- **Python sidecar** — PySceneDetect for scene detection only (better accuracy than ffmpeg scene filter). Spawned per request: `python -m scenedetect -i {path} detect-content --threshold 27 list-scenes -o {csv}`. CSV parsed by Node.
- **ffmpeg-static** npm pkg — probe, trim, frame extract
- **sharp** npm pkg — WebP encode w/ resize + quality retry (faster than ffmpeg for image-only encode)
- **MCP server** — separate Node process, `@modelcontextprotocol/sdk`, stdio transport. Calls Next.js HTTP API on `localhost:3000`. User registers in `~/.claude.json` mcpServers.
- **shadcn/ui + Tailwind** for UI
- **Filesystem storage** under `./data/projects/{projectId}/`
- **No DB** — `frames.json` per project = source of truth; project list = directory scan
- **Job state** in-memory map + `data/projects/{id}/status.json` (queued|probing|detecting|awaiting_refinement|extracting|done|error + progress %)

## Two-step flow

```
Upload video
  ↓
Probe (duration, fps, resolution)
  ↓
Detect scenes (PySceneDetect)  → scenes.json
  ↓
[UI / MCP] user refines scene list (merge, split, drop, adjust bounds, add ranges manually)
  ↓
Extract frames per chosen scene
  ↓
Compress to WebP, segment into ≤25-frame chunks
  ↓
Write frames.json + frames.md + snippet.txt
  ↓
done — return paths
```

User can skip refinement (accept all detected scenes) or override entirely (custom timestamp ranges, no detection).

## File layout

```
D:/video-to-claude/
  app/
    page.tsx                              # project list + upload
    projects/[id]/page.tsx                # scene review + refine + extract trigger
    api/
      projects/route.ts                   # POST upload, GET list
      projects/[id]/route.ts              # GET project state
      projects/[id]/status/route.ts
      projects/[id]/scenes/route.ts       # GET detected scenes, POST refined scene list
      projects/[id]/extract/route.ts      # POST trigger extraction from chosen scenes
      projects/[id]/preview/route.ts      # GET single frame at timestamp (?t=12.5)
      projects/[id]/snippet/route.ts      # GET copy-paste text (?seg=N)
      projects/[id]/frames/[seg]/[file]/route.ts  # serve webp
  lib/
    ffmpeg.ts                             # spawn wrapper, probe, trim, frame extract
    scenedetect.ts                        # python sidecar wrapper, CSV parse
    compress.ts                           # sharp WebP retry loop
    segment.ts                            # chunk frames into ≤25 per seg_NNN
    manifest.ts                           # frames.json + frames.md
    snippet.ts                            # Claude prompt builder
    paths.ts                              # path helpers
    jobs.ts                               # in-memory job registry + status writer
  components/
    UploadDropzone.tsx
    SceneList.tsx                         # detected scenes table, drag-merge, edit bounds
    SceneTimeline.tsx                     # visual timeline w/ scene markers + preview frames
    ExtractPanel.tsx                      # fps/quality knobs per scene, "extract" button
    FrameStrip.tsx
    SnippetCopy.tsx
  mcp/
    server.ts                             # MCP stdio server
    tools.ts                              # tool definitions (see below)
    client.ts                             # HTTP client → Next.js API
  python/
    pyproject.toml or requirements.txt    # scenedetect
    detect_scenes.py                      # thin wrapper if needed
  data/projects/                          # gitignored runtime output
  CLAUDE.md                               # blueprint + vision limits
  README.md                               # MCP install instructions
  package.json
  next.config.ts
  tailwind.config.ts
```

## Output layout per project

```
data/projects/{id}/
  source.mp4
  status.json
  probe.json                  # duration, fps, w, h, codec
  scenes.json                 # detected + refined scenes
  frames.json                 # final manifest after extraction
  frames.md                   # human index
  snippet.txt                 # default Claude snippet
  frames/
    scene_000/
      seg_000/
        f0001_00m05s.webp
        f0002_00m07s.webp
      seg_001/...
    scene_001/...
```

Layout groups by scene first, then by segment within scene. Lets MCP / UI return "all frames for scene N" cleanly.

## HTTP API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/projects` | multipart upload → `{projectId}`; runs probe + scene detect async |
| GET | `/api/projects` | list projects |
| GET | `/api/projects/[id]` | full state (probe + scenes + manifest if extracted) |
| GET | `/api/projects/[id]/status` | poll job status |
| GET | `/api/projects/[id]/scenes` | detected scene list |
| POST | `/api/projects/[id]/scenes` | save refined scene list `[{start, end, label?}, ...]` |
| POST | `/api/projects/[id]/extract` | kick off extraction `{ sceneIds?: number[], fps?: number, quality?: 'low'\|'med'\|'high' }` |
| GET | `/api/projects/[id]/preview?t=12.5` | single JPEG frame at timestamp |
| GET | `/api/projects/[id]/snippet?scene=N&seg=M` | plain-text Claude prompt |
| GET | `/api/projects/[id]/frames/[scene]/[seg]/[file]` | serve webp |

## MCP tool surface

Server name: `video-to-claude`. Tools exposed to Claude Code:

| Tool | Input | Output |
|---|---|---|
| `list_projects` | — | array of `{id, name, duration, status, sceneCount, frameCount}` |
| `upload_video` | `{path: string, name?: string}` | `{projectId, duration, w, h}` — copies local file into project dir |
| `get_scenes` | `{projectId}` | scene list w/ timecodes, frame counts, optional preview thumb paths |
| `refine_scenes` | `{projectId, scenes: [{start, end, label?}]}` | persisted list |
| `extract_frames` | `{projectId, sceneIds?: number[], fps?: number, quality?: string}` | blocks until done, returns `{frames: [{path, t, scene, idx}]}` |
| `get_frame_paths` | `{projectId, sceneId?, segId?}` | array of absolute paths ready for Claude to attach |
| `get_snippet` | `{projectId, sceneId?, segId?}` | text block w/ prompt + paths |
| `preview_frame` | `{projectId, t: number}` | absolute path to single jpeg |

Claude Code workflow:
```
user: "analyze the bug in this video, scene around 1:30"
claude → upload_video(...) → get_scenes(...) → (optionally refine_scenes) →
         extract_frames({sceneIds: [3]}) → get_frame_paths(...) → Read each frame
```

Frame paths returned are absolute so Claude's Read tool can attach directly without extra path resolution.

## Pipeline detail

1. **Upload**: write `source.mp4`, status=`probing`.
2. **Probe**: ffmpeg `-i` → parse duration/fps/resolution → `probe.json`. Status=`detecting`.
3. **Detect scenes**: spawn `python -m scenedetect -i source.mp4 detect-content --threshold 27 list-scenes -o scenes.csv -q`. Parse CSV → `scenes.json`:
   ```json
   { "scenes": [{"id":0,"start":0.0,"end":4.21,"startFrame":0,"endFrame":126}] }
   ```
   Generate preview JPEG at midpoint of each scene → `scenes/scene_000_preview.jpg`. Status=`awaiting_refinement`.
4. **Refinement** (optional): UI or MCP posts refined list. Persisted to `scenes.json` w/ `refined: true`.
5. **Extract** (`POST /extract`): for each chosen scene:
   - ffmpeg `-ss {start} -to {end} -vf fps={N} {tmpdir}/scene_NNN/raw_%04d.png` (default fps=1, configurable).
   - For each PNG, sharp pipeline: resize fit 960×540 no upscale → WebP q=80 → if >1.5MB retry q=70 → q=60. Hard cap 2MB.
   - Name `f{idx:04d}_{mm}m{ss}s.webp`, timestamp = scene.start + idx/fps.
   - Quality presets:
     - `low`: 640×360, q=70
     - `med` (default): 960×540, q=80 w/ retry
     - `high`: 1280×720, q=85 w/ retry, cap 3MB
6. **Segment**: chunk frames per scene into ≤25 → `seg_NNN/`.
7. **Manifest**:
   - `frames.json`: `{ projectId, source, probe, scenes: [{id, start, end, refined, segments: [{id, frames: [{idx, path, t, w, h, bytes}]}]}] }`
   - `frames.md`: human index w/ ready-to-paste snippets per scene+segment.
   - `snippet.txt`: default = first scene.
8. Status=`done`.

## Snippet format

```
Please analyze these frames from scene {N} ({start}–{end}) of {sourceName}.
For each frame, describe what changes vs the previous frame and call out
UI state changes, gestures, or events. Frames are chronological.

Frames:
{abs path}/data/projects/{id}/frames/scene_{NNN}/seg_{MMM}/f0001_00m05s.webp
...
```

UI exposes "Copy for Claude Code" per scene + per segment.

## Constraints encoded in code

- Max 25 frames per segment (`segment.ts`).
- Max 2MB per frame (med), target <1.5MB. `compress.ts` retry loop.
- Max dim 960×540 default; never exceed 8000px.
- Output always WebP.
- Absolute paths in MCP responses; relative in UI snippets (user pastes in repo root).

## Critical files

- `lib/scenedetect.ts` — python spawn + CSV parse
- `lib/ffmpeg.ts` — probe, trim, frame extract
- `lib/compress.ts` — sharp retry loop
- `lib/segment.ts` — chunking
- `lib/manifest.ts` — frames.json + frames.md
- `lib/snippet.ts` — prompt builder
- `mcp/server.ts` + `mcp/tools.ts` — MCP surface
- `app/api/projects/[id]/scenes/route.ts` — detect + refine
- `app/api/projects/[id]/extract/route.ts` — extraction kickoff
- `app/projects/[id]/page.tsx` — scene review UI
- `CLAUDE.md` — vision limits doc

## Out of scope (v1)

- Auth, multi-user
- Cloud deploy (ffmpeg/python won't run on Vercel functions; Sandbox = v2)
- Annotations / transcripts
- Audio extraction
- Auto-prompt-Claude (Claude pulls, doesn't push)

## Verification

1. `pip install scenedetect[opencv]` + `npm install`.
2. `npm run dev` → http://localhost:3000. Upload 30s test video.
3. Status flows: probing → detecting → awaiting_refinement. Scene list shows.
4. Refine (drop one scene, merge two) → POST persists.
5. Click extract → status=extracting → done. Inspect `data/projects/{id}/frames/scene_*/seg_*/`. All WebP <2MB, ≤960×540. `frames.json` valid.
6. MCP test: register `video-to-claude` in `~/.claude.json`. New Claude Code session → `mcp list` shows tools → call `list_projects`, `get_scenes`, `extract_frames`, `get_frame_paths`. Verify Claude attaches returned paths.
7. Copy snippet → paste into Claude Code → Claude reads + describes frames.
8. Edge: 4K input → downscaled. Static video → PySceneDetect returns 1 scene → still extracts. Custom override (skip detection, manual range) → still works.

## Decisions locked

- Stack: Next.js + Python sidecar (PySceneDetect) + Node MCP server.
- Detection: PySceneDetect content-detect threshold 27 default.
- Flow: two-step, scene refinement between detect and extract.
- MCP: stdio server, calls own HTTP API, exposes tools for Claude orchestration.
- Compression: sharp, WebP, 960×540, q=80 retry → 70 → 60, cap 2MB.
- Storage: filesystem under `data/projects/{id}/`, grouped by scene then segment.
- Deploy: localhost only.
