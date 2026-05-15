---
description: Show Claude a video snippet with annotations. Boots the video-to-claude UI, waits while you upload + annotate frames, then delivers the annotated images directly into this conversation.
allowed-tools: mcp__video-to-claude__start_capture_session, mcp__video-to-claude__await_capture
---

Run the following two MCP tools in order:

1. Call `mcp__video-to-claude__start_capture_session` with no arguments. It returns a sessionId and opens the browser for the user.

2. Immediately call `mcp__video-to-claude__await_capture` with the sessionId from step 1 and `timeoutSec: 600` to give the user 10 minutes. It will return image content blocks with the annotated frames.

After the tools complete, treat the returned images as the user's request — read the red arrows, boxes, and text labels, then make the corresponding code changes.
