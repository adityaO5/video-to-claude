"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scene {
  id: number;
  start: number;
  end: number;
  label?: string;
}

export interface ExtractPanelProps {
  projectId: string;
  scenes: Scene[];
  onExtractStart: () => void;
}

type Quality = "low" | "med" | "high";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExtractPanel({ projectId, scenes, onExtractStart }: ExtractPanelProps) {
  const [fps, setFps] = useState(1);
  const [quality, setQuality] = useState<Quality>("med");
  const [allScenes, setAllScenes] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fpsOptions = [0.5, 1, 1.5, 2];
  const qualityOptions: { value: Quality; label: string }[] = [
    { value: "low", label: "low" },
    { value: "med", label: "med" },
    { value: "high", label: "high" },
  ];

  function toggleScene(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExtract() {
    setExtracting(true);
    setError(null);
    try {
      const body: { fps: number; quality: Quality; sceneIds?: number[] } = {
        fps,
        quality,
      };
      if (!allScenes && selectedIds.size > 0) {
        body.sceneIds = Array.from(selectedIds);
      }
      const res = await fetch(`/api/projects/${projectId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      onExtractStart();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setExtracting(false);
    }
  }

  const canExtract = allScenes || selectedIds.size > 0;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span
          className="text-xs font-medium tracking-widest uppercase"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          Extract Frames
        </span>
      </div>

      <div className="px-4 py-4 flex flex-col gap-5">
        {/* FPS Slider */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              Frame rate
            </span>
            <span
              className="text-xs"
              style={{ color: "#f59e0b", fontFamily: "var(--font-mono)" }}
            >
              {fps} fps
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={fpsOptions.length - 1}
              step={1}
              value={fpsOptions.indexOf(fps) === -1 ? 1 : fpsOptions.indexOf(fps)}
              onChange={(e) => setFps(fpsOptions[parseInt(e.target.value, 10)])}
              className="flex-1"
              style={{ accentColor: "#f59e0b" }}
            />
            <div className="flex gap-1">
              {fpsOptions.map((f) => (
                <span
                  key={f}
                  className="text-xs"
                  style={{
                    color: fps === f ? "#f59e0b" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quality Radio */}
        <div className="flex flex-col gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Quality
          </span>
          <div className="flex gap-2">
            {qualityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setQuality(opt.value)}
                className="px-3 py-1.5 rounded text-xs transition-all duration-150"
                style={{
                  background:
                    quality === opt.value
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(255,255,255,0.04)",
                  border:
                    quality === opt.value
                      ? "1px solid rgba(245,158,11,0.4)"
                      : "1px solid var(--border)",
                  color: quality === opt.value ? "#f59e0b" : "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scene selection */}
        <div className="flex flex-col gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Scenes
          </span>
          <div className="flex flex-col gap-1.5">
            {/* All scenes toggle */}
            <label
              className="flex items-center gap-2 cursor-pointer"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <input
                type="checkbox"
                checked={allScenes}
                onChange={(e) => setAllScenes(e.target.checked)}
                style={{ accentColor: "#f59e0b" }}
              />
              <span
                className="text-xs"
                style={{ color: allScenes ? "var(--text)" : "var(--text-muted)" }}
              >
                All scenes
              </span>
            </label>

            {/* Per-scene checkboxes */}
            {!allScenes && (
              <div
                className="mt-1 rounded p-2 flex flex-col gap-1"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border)",
                }}
              >
                {scenes.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleScene(s.id)}
                      style={{ accentColor: "#f59e0b" }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: selectedIds.has(s.id) ? "var(--text)" : "var(--text-muted)" }}
                    >
                      Scene {s.id + 1}
                      {s.label ? ` · ${s.label}` : ""}
                      <span style={{ color: "var(--text-muted)" }}>
                        {" "}({formatTime(s.start)} – {formatTime(s.end)})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded px-3 py-2 text-xs"
            style={{
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              color: "#f87171",
              fontFamily: "var(--font-mono)",
            }}
          >
            {error}
          </div>
        )}

        {/* Extract button */}
        <button
          onClick={() => void handleExtract()}
          disabled={extracting || !canExtract}
          className="w-full py-2.5 rounded text-sm font-medium transition-all duration-150"
          style={{
            background: extracting || !canExtract
              ? "rgba(245,158,11,0.06)"
              : "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.3)",
            color: extracting || !canExtract ? "rgba(245,158,11,0.4)" : "#f59e0b",
            cursor: extracting || !canExtract ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono)",
          }}
          onMouseEnter={(e) => {
            if (!extracting && canExtract) {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.2)";
            }
          }}
          onMouseLeave={(e) => {
            if (!extracting && canExtract) {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.12)";
            }
          }}
        >
          {extracting ? "Starting extraction..." : "Extract frames"}
        </button>
      </div>
    </div>
  );
}
