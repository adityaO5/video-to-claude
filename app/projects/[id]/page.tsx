"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SceneList, { type RefinedScene } from "@/components/SceneList";
import ExtractPanel from "@/components/ExtractPanel";
import FrameStrip from "@/components/FrameStrip";
import SnippetCopy from "@/components/SnippetCopy";

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

// ── SceneTimeline ─────────────────────────────────────────────────────────────

function SceneTimeline({ scenes, duration }: { scenes: Scene[]; duration: number }) {
  if (!duration || scenes.length === 0) return null;

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <span
        className="text-xs font-medium tracking-widest uppercase"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        Timeline
      </span>
      {/* Timeline bar */}
      <div className="relative h-6 rounded overflow-hidden" style={{ background: "var(--surface-2)" }}>
        {scenes.map((scene, i) => {
          const left = (scene.start / duration) * 100;
          const width = ((scene.end - scene.start) / duration) * 100;
          const hue = (i * 47) % 360;
          return (
            <div
              key={scene.id}
              className="absolute top-0 bottom-0 flex items-center justify-center text-xs overflow-hidden"
              title={`Scene ${scene.id + 1}${scene.label ? ` · ${scene.label}` : ""}: ${scene.start.toFixed(1)}s – ${scene.end.toFixed(1)}s`}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: `hsla(${hue}, 60%, 50%, 0.25)`,
                borderRight: "1px solid rgba(0,0,0,0.3)",
                fontFamily: "var(--font-mono)",
                color: `hsla(${hue}, 70%, 70%, 0.9)`,
              }}
            >
              {width > 4 && <span>{scene.id + 1}</span>}
            </div>
          );
        })}
      </div>
      {/* Scene markers */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {scenes.map((scene) => (
          <span
            key={scene.id}
            className="text-xs"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            <span style={{ color: "var(--text)" }}>S{scene.id + 1}</span>{" "}
            {scene.start.toFixed(1)}–{scene.end.toFixed(1)}s
            {scene.label && (
              <span style={{ color: "#f59e0b" }}> · {scene.label}</span>
            )}
          </span>
        ))}
      </div>
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col min-h-screen" style={{ zIndex: 1 }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-4"
        style={{
          background: "rgba(13,13,15,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
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

      {/* Main content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Loading */}
        {loading && (
          <div
            className="flex flex-col items-center justify-center py-16 gap-3"
          >
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

            {/* ── Status: probing/detecting ── */}
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

            {/* ── Status: awaiting_refinement ── */}
            {status === "awaiting_refinement" && (
              <div className="flex flex-col gap-4">
                {/* Scene timeline */}
                {probe && scenes.length > 0 && (
                  <SceneTimeline scenes={scenes} duration={probe.duration} />
                )}

                {/* Scene list */}
                {scenes.length > 0 && (
                  <SceneList
                    projectId={id}
                    scenes={scenes}
                    refined={refined}
                    onRefine={handleRefine}
                  />
                )}

                {/* Extract panel */}
                <ExtractPanel
                  projectId={id}
                  scenes={scenes}
                  onExtractStart={handleExtractStart}
                />
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

            {/* ── Status: done ── */}
            {status === "done" && manifest && (
              <div className="flex flex-col gap-6">
                {/* Global snippet */}
                <SnippetCopy projectId={id} label="All frames snippet" />

                {/* Per scene/segment */}
                {manifest.scenes.map((scene) => (
                  <div
                    key={scene.id}
                    className="flex flex-col gap-3 rounded-lg p-4"
                    style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
                  >
                    {/* Scene header */}
                    <div className="flex items-center gap-2">
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{
                          background: "rgba(245,158,11,0.15)",
                          color: "#f59e0b",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {scene.id + 1}
                      </span>
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                      >
                        Scene {scene.id + 1}
                        {scene.label && (
                          <span style={{ color: "#f59e0b" }}> · {scene.label}</span>
                        )}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                      >
                        {scene.start.toFixed(1)}s – {scene.end.toFixed(1)}s
                      </span>
                    </div>

                    {/* Per-segment frames + snippet */}
                    {scene.segments.map((seg) => (
                      <div key={seg.id} className="flex flex-col gap-2">
                        {/* Segment label */}
                        {scene.segments.length > 1 && (
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                          >
                            Segment {seg.id + 1}
                            {" "}
                            <span style={{ color: "var(--text-muted)" }}>
                              ({seg.frames.length} frames)
                            </span>
                          </span>
                        )}

                        {/* Frame strip */}
                        <FrameStrip
                          projectId={id}
                          sceneId={scene.id}
                          segId={seg.id}
                          frames={seg.frames}
                        />

                        {/* Snippet */}
                        <SnippetCopy
                          projectId={id}
                          sceneId={scene.id}
                          segId={seg.id}
                          label={
                            scene.label
                              ? `${scene.label} · seg ${seg.id + 1}`
                              : undefined
                          }
                        />
                      </div>
                    ))}
                  </div>
                ))}
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
