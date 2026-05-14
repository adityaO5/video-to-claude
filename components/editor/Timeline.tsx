"use client";

import { useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scene {
  id: number;
  start: number;
  end: number;
  label?: string;
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  scenes: Scene[];
  onSeek: (t: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function sceneColor(id: number): { bg: string; borderTop: string } {
  const h = (id * 47 + 200) % 360;
  return {
    bg: `hsl(${h}, 40%, 30%)`,
    borderTop: `hsl(${h}, 40%, 45%)`,
  };
}

function getTickInterval(duration: number): { minor: number; label: number } {
  if (duration <= 60) return { minor: 1, label: 10 };
  if (duration <= 300) return { minor: 5, label: 30 };
  return { minor: 10, label: 60 };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Timeline({
  duration,
  currentTime,
  scenes,
  onSeek,
}: TimelineProps) {
  const [dragging, setDragging] = useState(false);

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  const seekFromEvent = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onSeek(clamp(ratio * duration, 0, duration));
    },
    [duration, onSeek]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    seekFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    seekFromEvent(e);
  };

  const handlePointerUp = () => setDragging(false);

  // Tick generation
  const { minor: tickStep, label: labelStep } = getTickInterval(duration);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += tickStep) {
    ticks.push(t);
  }

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Heights
  const RULER_H = 20;
  const SCENE_H = 70;
  const SCRUB_H = 20;
  const TOTAL_H = RULER_H + SCENE_H + SCRUB_H;

  return (
    <div
      style={{
        width: "100%",
        height: `${TOTAL_H}px`,
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        userSelect: "none",
        position: "relative",
        cursor: dragging ? "grabbing" : "pointer",
        fontFamily: "var(--font-mono), monospace",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* ── Time Ruler ────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: `${RULER_H}px`,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {ticks.map((t) => {
          const pct = duration > 0 ? (t / duration) * 100 : 0;
          const isLabel = t % labelStep === 0;
          return (
            <div
              key={t}
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* Tick mark */}
              <div
                style={{
                  width: "1px",
                  height: isLabel ? "8px" : "4px",
                  background: isLabel ? "var(--text-muted)" : "var(--border)",
                  marginTop: isLabel ? "4px" : "8px",
                  flexShrink: 0,
                }}
              />
              {/* Label */}
              {isLabel && t > 0 && (
                <span
                  style={{
                    fontSize: "9px",
                    color: "var(--text-muted)",
                    lineHeight: 1,
                    marginTop: "1px",
                    whiteSpace: "nowrap",
                    transform: "translateX(-50%)",
                  }}
                >
                  {formatTime(t)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Scene Track ───────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: `${RULER_H}px`,
          left: 0,
          right: 0,
          height: `${SCENE_H}px`,
          background: "var(--surface-2)",
          overflow: "hidden",
        }}
      >
        {scenes.map((scene) => {
          const left = duration > 0 ? (scene.start / duration) * 100 : 0;
          const width =
            duration > 0 ? ((scene.end - scene.start) / duration) * 100 : 0;
          const colors = sceneColor(scene.id);
          return (
            <div
              key={scene.id}
              style={{
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                bottom: 0,
                background: colors.bg,
                borderTop: `2px solid ${colors.borderTop}`,
                boxSizing: "border-box",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                paddingLeft: "6px",
                paddingRight: "10px",
              }}
            >
              {/* Scene label */}
              <span
                style={{
                  fontSize: "10px",
                  color: "rgba(232,232,234,0.75)",
                  fontFamily: "var(--font-mono), monospace",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1,
                }}
              >
                {scene.label ?? `Scene ${scene.id}`}
              </span>

              {/* Right-edge amber divider */}
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: "2px",
                  background: "#f59e0b",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Scrub Bar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${SCRUB_H}px`,
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        {/* Progress fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${playheadPct}%`,
            background: "rgba(245,158,11,0.4)",
            transition: dragging ? "none" : "width 0.1s linear",
          }}
        />
      </div>

      {/* ── Playhead (spans full height) ──────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${playheadPct}%`,
          width: "2px",
          background: "#f59e0b",
          zIndex: 10,
          transform: "translateX(-1px)",
          pointerEvents: "none",
          transition: dragging ? "none" : "left 0.1s linear",
        }}
      >
        {/* Downward triangle at top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "7px solid #f59e0b",
          }}
        />
      </div>
    </div>
  );
}
