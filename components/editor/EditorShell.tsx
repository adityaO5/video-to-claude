"use client";

import React, { useEffect } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import VideoViewer from "./VideoViewer";
import Inspector from "./Inspector";
import Timeline from "./Timeline";
import type { ProjectManifest } from "@/lib/manifest";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scene {
  id: number;
  start: number;
  end: number;
  label?: string;
  startFrame: number;
  endFrame: number;
}

interface RefinedScene {
  start: number;
  end: number;
  label?: string;
}

export interface EditorShellProps {
  projectId: string;
  status: string;
  probe: { duration: number; fps: number; width: number; height: number; codec: string };
  scenes: Scene[];
  refined: boolean;
  manifest?: ProjectManifest | null;
  onRefine: (scenes: RefinedScene[]) => void;
  // Playback state — lifted from parent page
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (t: number) => void;
  onPlayPauseChange: (playing: boolean) => void;
  onSeek: (t: number) => void;
  playerRef: React.RefObject<HTMLVideoElement | null>;
}

// ── EditorShell ───────────────────────────────────────────────────────────────

export default function EditorShell({
  projectId,
  status,
  probe,
  scenes,
  refined,
  manifest,
  onRefine,
  currentTime,
  isPlaying,
  onTimeUpdate,
  onPlayPauseChange,
  onSeek,
  playerRef,
}: EditorShellProps) {
  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };

    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      const video = playerRef.current;

      switch (e.key) {
        case " ": {
          e.preventDefault();
          if (!video) return;
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
        }

        case "ArrowLeft": {
          e.preventDefault();
          if (!video) return;
          if (e.shiftKey) {
            // Jump to previous scene boundary
            const boundary = scenes
              .map((s) => s.end)
              .filter((t) => t < currentTime - 0.1)
              .sort((a, b) => b - a)[0];
            if (boundary !== undefined) {
              video.currentTime = boundary;
              onSeek(boundary);
            }
          } else {
            const next = Math.max(0, video.currentTime - 1 / probe.fps);
            video.currentTime = next;
            onSeek(next);
          }
          break;
        }

        case "ArrowRight": {
          e.preventDefault();
          if (!video) return;
          if (e.shiftKey) {
            // Jump to next scene boundary
            const boundary = scenes
              .map((s) => s.start)
              .filter((t) => t > currentTime + 0.1)
              .sort((a, b) => a - b)[0];
            if (boundary !== undefined) {
              video.currentTime = boundary;
              onSeek(boundary);
            }
          } else {
            const next = Math.min(probe.duration, video.currentTime + 1 / probe.fps);
            video.currentTime = next;
            onSeek(next);
          }
          break;
        }

        case "Home": {
          e.preventDefault();
          if (!video) return;
          video.currentTime = 0;
          onSeek(0);
          break;
        }

        case "End": {
          e.preventDefault();
          if (!video) return;
          video.currentTime = probe.duration;
          onSeek(probe.duration);
          break;
        }

        default:
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [currentTime, probe.fps, probe.duration, scenes, playerRef, onSeek]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "calc(100vh - 56px)", background: "var(--bg)" }}>
      <ResizablePanelGroup orientation="vertical" style={{ height: "100%" }}>
        {/* Top panel: Viewer + Inspector */}
        <ResizablePanel defaultSize={75} minSize={50}>
          <ResizablePanelGroup orientation="horizontal" style={{ height: "100%" }}>
            {/* Viewer */}
            <ResizablePanel defaultSize={70} minSize={40}>
              <VideoViewer
                ref={playerRef}
                projectId={projectId}
                probe={probe}
                onTimeUpdate={onTimeUpdate}
                onPlayPauseChange={onPlayPauseChange}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Inspector */}
            <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
              <Inspector
                projectId={projectId}
                status={status}
                scenes={scenes}
                refined={refined}
                manifest={manifest}
                onRefine={onRefine}
                currentTime={currentTime}
                onSeek={onSeek}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Bottom panel: Timeline */}
        <ResizablePanel defaultSize={25} minSize={12} maxSize={40}>
          <Timeline
            duration={probe.duration}
            currentTime={currentTime}
            scenes={scenes}
            onSeek={onSeek}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
