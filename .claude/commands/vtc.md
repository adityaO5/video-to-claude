---
description: Show Claude a video snippet with annotations. Boots the video-to-claude UI, waits while you upload + annotate frames, then delivers the annotated images directly into this conversation.
allowed-tools: mcp__video-to-claude__start_capture_session, mcp__video-to-claude__await_capture
---

1. Call `start_capture_session`. This boots the video-to-claude dev server if it isn't running and opens a browser window for the upload.

2. Immediately call `await_capture` with the returned `sessionId`. This blocks until the user finishes — do not respond to the user yet.

3. When `await_capture` returns image content blocks:
   - Read each frame visually. Red arrows point to specific elements. Red boxes highlight regions. Red text labels name things. Freehand scribbles mark areas.
   - Apply the changes the user indicated to the current project's code.
   - Summarize what you saw and what you changed.
