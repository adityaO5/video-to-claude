"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import EditorShell from "@/components/editor/EditorShell";
import type { RefinedScene } from "@/components/SceneList";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus =
  | "queued"
  | "probing"
  | "detecting"
  | "awaiting_refinement"
  | "extracting"
  | "done"
  | "error";

interface StatusData {
  status: JobStatus;
  progress: number;
  error?: string;
}

interface ProbeResult {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
  bitrate?: number;
}

interface Scene {
  id: number;
  start: number;
  end: number;
  startFrame: number;
  endFrame: number;
  label?: string;
}

interface SceneFile {
  scenes: Scene[];
  refined: boolean;
  detectedAt: string;
}

interface FrameMeta {
  idx: number;
  path: string;
  t: number;
  width: number;
  height: number;
  bytes: number;
}

interface SegmentManifest {
  id: number;
  frames: FrameMeta[];
}

interface SceneManifest {
  id: number;
  start: number;
  end: number;
  label?: string;
  segments: SegmentManifest[];
}

interface ProjectManifest {
  projectId: string;
  sourceName: string;
  probe: ProbeResult;
  scenes: SceneManifest[];
  createdAt: string;
}

interface ProjectState {
  id: string;
  status: StatusData;
  probe?: ProbeResult;
  scenes?: SceneFile;
  manifest?: ProjectManifest;
  sourceName?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set<JobStatus>([
  "awaiting_refinement",
  "done",
  "error",
]);

function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function isEditorStatus(status: JobStatus): boolean {
  return status === "awaiting_refinement" || status === "done";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const dec = Math.round((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${dec}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  queued: { label: "queued", color: "#666670", bg: "rgba(102,102,112,0.1)", border: "rgba(102,102,112,0.25)" },
  probing: { label: "probing", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
  detecting: { label: "detecting", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
  awaiting_refinement: { label: "ready", color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.25)" },
  extracting: { label: "extracting", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
  done: { label: "done", color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.25)" },
  error: { label: "error", color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)" },
};

function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;
  const pulsing = !isTerminal(status) && status !== "queued";

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        fontFamily: "var(--font-mono)",
      }}
    >
      {pulsing && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: cfg.color }}
        />
      )}
      {cfg.label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress, color = "#f59e0b" }: { progress: number; color?: string }) {
  return (
    <div
      className="w-full h-1 rounded-full overflow-hidden"
      style={{ background: "var(--surface-2)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(2, progress)}%`, background: color }}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Local refined scenes (to update after save)
  const [refinedScenes, setRefinedScenes] = useState<Scene[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback state — lifted here so header/shell share it
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<HTMLVideoElement | null>(null);

  const handleSeek = (t: number) => {
    if (playerRef.current) playerRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setFetchError("Project not found");
        } else {
          setFetchError(`HTTP ${res.status}`);
        }
        return;
      }
      const data = (await res.json()) as ProjectState;
      setProject(data);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial fetch
  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  // Polling when non-terminal
  useEffect(() => {
    if (!project) return;
    const terminal = isTerminal(project.status.status);

    if (!terminal) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          void fetchProject();
        }, 2000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [project, fetchProject]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const status = project?.status.status;
  const progress = project?.status.progress ?? 0;
  const probe = project?.probe;
  const manifest = project?.manifest;
  // Prefer locally-refined scenes, then server scenes
  const scenes: Scene[] =
    refinedScenes ??
    project?.scenes?.scenes ??
    [];
  const refined = !!(project?.scenes?.refined);
  const sourceName = project?.sourceName ?? project?.id ?? id;

  function handleRefine(updated: RefinedScene[]) {
    const newScenes: Scene[] = updated.map((s, i) => ({
      id: i,
      start: s.start,
      end: s.end,
      startFrame: 0,
      endFrame: 0,
      ...(s.label ? { label: s.label } : {}),
    }));
    setRefinedScenes(newScenes);
  }

  function handleExtractStart() {
    // After extract starts, begin polling
    void fetchProject();
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        void fetchProject();
      }, 2000);
    }
  }
  // handleExtractStart is referenced inside EditorShell via onRefine flow;
  // kept for completeness but not directly passed — suppress unused warning
  void handleExtractStart;

  // ── Sticky header (shared across all states) ──────────────────────────────

  const header = (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-6 py-4"
      style={{
        height: 56,
        background: "rgba(13,13,15,0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs transition-colors duration-150"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", textDecoration: "none" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)"; }}
        >
          <span style={{ color: "#f59e0b" }}>←</span> projects
        </Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
        >
          {sourceName}
        </span>
      </div>
      {status && <StatusBadge status={status} />}
    </header>
  );

  // ── Editor layout (awaiting_refinement | done) ────────────────────────────

  if (!loading && !fetchError && project && status && isEditorStatus(status)) {
    // Guard: probe must be available before rendering the editor
    if (!probe) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          {header}
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(245,158,11,0.2)", borderTopColor: "#f59e0b" }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Loading probe data...
            </span>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        {header}
        <EditorShell
          projectId={id}
          status={status}
          probe={probe}
          scenes={scenes}
          refined={refined}
          manifest={manifest}
          onRefine={handleRefine}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onTimeUpdate={setCurrentTime}
          onPlayPauseChange={setIsPlaying}
          onSeek={handleSeek}
          playerRef={playerRef}
        />
      </div>
    );
  }

  // ── Non-editor layout ─────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col min-h-screen" style={{ zIndex: 1 }}>
      {header}

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{
                borderColor: "rgba(245,158,11,0.2)",
                borderTopColor: "#f59e0b",
              }}
            />
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              Loading project...
            </span>
          </div>
        )}

        {/* Fetch error */}
        {!loading && fetchError && (
          <div
            className="rounded-lg px-4 py-4 text-sm"
            style={{
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              color: "#f87171",
              fontFamily: "var(--font-mono)",
            }}
          >
            {fetchError}
          </div>
        )}

        {!loading && project && (
          <>
            {/* Video metadata header */}
            {probe && (
              <div
                className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <span
                  className="text-sm font-medium truncate flex-1"
                  style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                >
                  {sourceName}
                </span>
                <div
                  className="flex items-center gap-4 text-xs flex-shrink-0"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  <span>
                    <span style={{ color: "#f59e0b" }}>dur</span>{" "}
                    {formatDuration(probe.duration)}
                  </span>
                  <span>
                    <span style={{ color: "#f59e0b" }}>res</span>{" "}
                    {probe.width}×{probe.height}
                  </span>
                  <span>
                    <span style={{ color: "#f59e0b" }}>fps</span>{" "}
                    {probe.fps}
                  </span>
                  <span>
                    <span style={{ color: "#f59e0b" }}>codec</span>{" "}
                    {probe.codec}
                  </span>
                </div>
              </div>
            )}

            {/* ── Status: probing/detecting/queued ── */}
            {(status === "probing" || status === "detecting" || status === "queued") && (
              <div
                className="rounded-lg px-4 py-6 flex flex-col items-center gap-4"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <div
                  className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{
                    borderColor: "rgba(245,158,11,0.2)",
                    borderTopColor: "#f59e0b",
                  }}
                />
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="text-sm"
                    style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                  >
                    {status === "queued"
                      ? "Queued..."
                      : status === "probing"
                        ? "Probing video..."
                        : "Detecting scenes..."}
                  </span>
                  {progress > 0 && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {progress}%
                    </span>
                  )}
                </div>
                {progress > 0 && (
                  <div className="w-full max-w-sm">
                    <ProgressBar progress={progress} />
                  </div>
                )}
              </div>
            )}

            {/* ── Status: extracting ── */}
            {status === "extracting" && (
              <div
                className="rounded-lg px-4 py-6 flex flex-col items-center gap-4"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <div
                  className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{
                    borderColor: "rgba(245,158,11,0.2)",
                    borderTopColor: "#f59e0b",
                  }}
                />
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="text-sm"
                    style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                  >
                    Extracting frames...
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {progress}%
                  </span>
                </div>
                <div className="w-full max-w-sm">
                  <ProgressBar progress={progress} />
                </div>
              </div>
            )}

            {/* ── Status: error ── */}
            {status === "error" && (
              <div
                className="rounded-lg px-4 py-4 flex flex-col gap-2"
                style={{
                  background: "rgba(248,113,113,0.06)",
                  border: "1px solid rgba(248,113,113,0.2)",
                }}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: "#f87171", fontFamily: "var(--font-mono)" }}
                >
                  Error
                </span>
                <span
                  className="text-xs"
                  style={{ color: "rgba(248,113,113,0.8)", fontFamily: "var(--font-mono)" }}
                >
                  {project.status.error ?? "An unknown error occurred."}
                </span>
                <Link
                  href="/"
                  className="mt-2 text-xs self-start"
                  style={{ color: "#f59e0b", fontFamily: "var(--font-mono)" }}
                >
                  ← Back to projects
                </Link>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer
        className="py-4 px-6 flex items-center justify-center"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span
          className="text-xs"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          powered by <span style={{ color: "#f59e0b" }}>Claude</span>
        </span>
      </footer>
    </div>
  );
}
