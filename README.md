# video-to-claude

Convert local video files into compressed WebP frames optimized for Claude Code's vision support.

## Prerequisites

- Node.js 18+
- Python 3.8+ with pip
- ffmpeg in PATH (or use the bundled ffmpeg-static)

## Setup

1. Install Node deps:
   ```bash
   npm install
   ```

2. Install Python deps:
   ```bash
   pip install scenedetect[opencv-headless]
   ```

3. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Using as a Claude Code MCP tool

Add to your `~/.claude.json` (or create if it doesn't exist):

```json
{
  "mcpServers": {
    "video-to-claude": {
      "command": "node",
      "args": ["D:/video-to-claude/mcp/dist/mcp/server.js"],
      "env": {
        "VIDEO_TO_CLAUDE_URL": "http://localhost:3000"
      }
    }
  }
}
```

Build the MCP server first:
```bash
npm run mcp:build
```

Make sure `npm run dev` is running before using Claude Code MCP tools.

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all processed video projects |
| `upload_video` | Upload a local video file by path |
| `get_scenes` | Get detected scene list for a project |
| `refine_scenes` | Save a refined scene list |
| `extract_frames` | Extract frames (blocks until done) |
| `get_frame_paths` | Get absolute paths to extracted frames |
| `get_snippet` | Get a ready-to-paste Claude Code prompt |
| `preview_frame` | Get a single frame at a timestamp |

## Example Claude Code workflow

```
Upload and analyze a video:
1. Use upload_video with path to your video
2. Use get_scenes to see detected scene list
3. Use extract_frames to extract frames (specify scene IDs or extract all)
4. Use get_frame_paths to get the image paths
5. Use Read tool on each path to analyze frames
```
