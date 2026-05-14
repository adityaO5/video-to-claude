"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (t: number) => void;
  onPlayPauseChange: (playing: boolean) => void;
  onSeek: (t: number) => void;
  playerRef: React.RefObject<HTMLVideoElement | null>;
}

// ── Handle styles ─────────────────────────────────────────────────────────────

const HANDLE_SIZE = 5; // px — thick enough to grab easily

function hStyle(dir: "h" | "v"): React.CSSProperties {
  return {
    flexShrink: 0,
    background: "var(--border)",
    transition: "background 0.12s",
    cursor: dir === "v" ? "col-resize" : "row-resize",
    ...(dir === "v" ? { width: HANDLE_SIZE } : { height: HANDLE_SIZE }),
    zIndex: 10,
  };
}

// ── Custom drag hook ──────────────────────────────────────────────────────────

function useDrag(
  onDelta: (delta: number) => void,
  axis: "x" | "y"
) {
  const dragging = useRef(false);
  const last = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      last.current = axis === "x" ? e.clientX : e.clientY;
    },
    [axis]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const curr = axis === "x" ? e.clientX : e.clientY;
      onDelta(curr - last.current);
      last.current = curr;
    },
    [axis, onDelta]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
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
  isPlaying: _isPlaying,
  onTimeUpdate,
  onPlayPauseChange,
  onSeek,
  playerRef,
}: EditorShellProps) {
  // Shell outer div ref — needed to compute percentages
  const shellRef = useRef<HTMLDivElement>(null);

  // Sizes as pixel values; initialised on first render via layout effect
  const [topH, setTopH] = useState<number | null>(null);   // height of top row (viewer+inspector)
  const [inspW, setInspW] = useState<number | null>(null); // width of inspector panel

  // Initialise once shell mounts
  useEffect(() => {
    if (!shellRef.current) return;
    const h = shellRef.current.clientHeight;
    const w = shellRef.current.clientWidth;
    setTopH(Math.round(h * 0.75));
    setInspW(Math.round(w * 0.30));
  }, []);

  // Vertical handle (viewer | inspector) — drag in X
  const dragInspW = useCallback(
    (delta: number) => {
      setInspW((prev) => {
        if (prev === null || !shellRef.current) return prev;
        const totalW = shellRef.current.clientWidth;
        const minInsp = 200;
        const maxInsp = Math.round(totalW * 0.55);
        return Math.max(minInsp, Math.min(maxInsp, prev - delta)); // subtract: dragging handle left increases inspector
      });
    },
    []
  );

  // Horizontal handle (top row | timeline) — drag in Y
  const dragTopH = useCallback(
    (delta: number) => {
      setTopH((prev) => {
        if (prev === null || !shellRef.current) return prev;
        const totalH = shellRef.current.clientHeight;
        const minTop = Math.round(totalH * 0.40);
        const maxTop = Math.round(totalH * 0.88);
        return Math.max(minTop, Math.min(maxTop, prev + delta));
      });
    },
    []
  );

  const vHandleDrag = useDrag(dragInspW, "x");
  const hHandleDrag = useDrag(dragTopH, "y");

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

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
          video.paused ? video.play() : video.pause();
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (!video) return;
          if (e.shiftKey) {
            const b = scenes.map((s) => s.end).filter((t) => t < currentTime - 0.1).sort((a, b) => b - a)[0];
            if (b !== undefined) { video.currentTime = b; onSeek(b); }
          } else {
            const n = Math.max(0, video.currentTime - 1 / probe.fps);
            video.currentTime = n; onSeek(n);
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (!video) return;
          if (e.shiftKey) {
            const b = scenes.map((s) => s.start).filter((t) => t > currentTime + 0.1).sort((a, b) => a - b)[0];
            if (b !== undefined) { video.currentTime = b; onSeek(b); }
          } else {
            const n = Math.min(probe.duration, video.currentTime + 1 / probe.fps);
            video.currentTime = n; onSeek(n);
          }
          break;
        }
        case "Home": {
          e.preventDefault();
          if (!video) return;
          video.currentTime = 0; onSeek(0);
          break;
        }
        case "End": {
          e.preventDefault();
          if (!video) return;
          video.currentTime = probe.duration; onSeek(probe.duration);
          break;
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentTime, probe.fps, probe.duration, scenes, playerRef, onSeek]);

  // ── Render ──────────────────────────────────────────────────────────────────

  // Before size is measured, render invisible placeholder to avoid flash
  const ready = topH !== null && inspW !== null;

  return (
    <div
      ref={shellRef}
      style={{
        height: "calc(100vh - 56px)",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        overflow: "hidden",
        visibility: ready ? "visible" : "hidden",
      }}
    >
      {ready && (
        <>
          {/* ── Top row: Viewer + Inspector ─────────────────────────────── */}
          <div
            style={{
              height: topH,
              flexShrink: 0,
              display: "flex",
              flexDirection: "row",
              overflow: "hidden",
            }}
          >
            {/* Viewer — fills remaining width */}
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <VideoViewer
                ref={playerRef}
                projectId={projectId}
                probe={probe}
                onTimeUpdate={onTimeUpdate}
                onPlayPauseChange={onPlayPauseChange}
              />
            </div>

            {/* Vertical drag handle */}
            <div
              {...vHandleDrag}
              style={hStyle("v")}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f59e0b"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--border)"; }}
            />

            {/* Inspector — fixed width, draggable */}
            <div style={{ width: inspW, flexShrink: 0, overflow: "hidden" }}>
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
            </div>
          </div>

          {/* ── Horizontal drag handle ──────────────────────────────────── */}
          <div
            {...hHandleDrag}
            style={hStyle("h")}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f59e0b"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--border)"; }}
          />

          {/* ── Timeline — fills remaining height ──────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <Timeline
              duration={probe.duration}
              currentTime={currentTime}
              scenes={scenes}
              onSeek={onSeek}
            />
          </div>
        </>
      )}
    </div>
  );
}
