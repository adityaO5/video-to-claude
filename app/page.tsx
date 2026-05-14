"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import UploadDropzone from "@/components/UploadDropzone";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  status: string;
  progress: number;
  error?: string;
  sourceName?: string;
  duration?: number;
  width?: number;
  height?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  "awaiting_refinement",
  "done",
  "error",
  "complete",
]);

function isInProgress(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatResolution(w?: number, h?: number): string {
  if (!w || !h) return "";
  return `${w}×${h}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  queued: {
    label: "queued",
    color: "#666670",
    bg: "rgba(102,102,112,0.1)",
    border: "rgba(102,102,112,0.25)",
  },
  probing: {
    label: "probing",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.25)",
  },
  detecting: {
    label: "detecting",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.25)",
  },
  awaiting_refinement: {
    label: "ready",
    color: "#34d399",
    bg: "rgba(52,211,153,0.1)",
    border: "rgba(52,211,153,0.25)",
  },
  done: {
    label: "done",
    color: "#34d399",
    bg: "rgba(52,211,153,0.1)",
    border: "rgba(52,211,153,0.25)",
  },
  complete: {
    label: "done",
    color: "#34d399",
    bg: "rgba(52,211,153,0.1)",
    border: "rgba(52,211,153,0.25)",
  },
  error: {
    label: "error",
    color: "#f87171",
    bg: "rgba(248,113,113,0.1)",
    border: "rgba(248,113,113,0.25)",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    color: "#666670",
    bg: "rgba(102,102,112,0.1)",
    border: "rgba(102,102,112,0.25)",
  };

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
      {isInProgress(status) && status !== "queued" && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: cfg.color }}
        />
      )}
      {cfg.label}
    </span>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onDelete,
}: {
  project: ProjectSummary;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const inProgress = isInProgress(project.status);
  const displayName = project.sourceName ?? project.id;
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${displayName}"? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    onDelete(project.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/projects/${project.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ")
          router.push(`/projects/${project.id}`);
      }}
      className="group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-150"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "rgba(245,158,11,0.35)";
        el.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "var(--border)";
        el.style.background = "var(--surface)";
      }}
    >
      {/* Amber accent left bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 transition-all duration-150"
        style={{
          background: inProgress
            ? "#f59e0b"
            : project.status === "error"
              ? "#f87171"
              : "#34d399",
          opacity: 0.6,
        }}
      />

      <div className="px-4 py-4 pl-5 flex flex-col gap-3">
        {/* Top row: name + badge + delete */}
        <div className="flex items-start justify-between gap-3">
          <span
            className="text-sm font-medium leading-snug truncate flex-1"
            style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
            title={displayName}
          >
            {displayName}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={project.status} />
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete project"
              style={{
                background: "transparent",
                border: "none",
                cursor: deleting ? "not-allowed" : "pointer",
                color: "#666670",
                fontSize: 14,
                padding: "2px 4px",
                borderRadius: 4,
                lineHeight: 1,
                opacity: deleting ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#666670"; }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Metadata row */}
        <div
          className="flex items-center gap-3 text-xs"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {project.duration !== undefined && (
            <span>{formatDuration(project.duration)}</span>
          )}
          {project.width && project.height && (
            <>
              <span style={{ color: "var(--border)" }}>·</span>
              <span>{formatResolution(project.width, project.height)}</span>
            </>
          )}
          {!project.duration && !project.width && (
            <span className="italic" style={{ color: "var(--text-muted)" }}>
              {project.id}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {inProgress && project.progress > 0 && (
          <div
            className="w-full h-0.5 rounded-full overflow-hidden"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${project.progress}%`,
                background: "#f59e0b",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = (await res.json()) as ProjectSummary[];
      setProjects(data);
    } catch {
      // ignore network errors on poll
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  // Polling: only when there's at least one in-progress project
  useEffect(() => {
    const hasInProgress = projects.some((p) => isInProgress(p.status));

    if (hasInProgress) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          void fetchProjects();
        }, 3000);
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
  }, [projects, fetchProjects]);

  return (
    <div
      className="relative flex flex-col min-h-screen"
      style={{ zIndex: 1 }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-4"
        style={{
          background: "rgba(13,13,15,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Amber accent dot */}
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "#f59e0b" }}
          />
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
          >
            video-to-claude
          </span>
        </div>
        <span
          className="text-xs hidden sm:block"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          v0.1.0
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 flex flex-col gap-12">
        {/* Hero */}
        <div className="flex flex-col gap-3 pt-4">
          <h1
            className="text-3xl font-semibold tracking-tight leading-tight"
            style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
          >
            video
            <span style={{ color: "#f59e0b" }}>/</span>
            to
            <span style={{ color: "#f59e0b" }}>/</span>
            claude
          </h1>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}
          >
            Convert video to Claude Code–ready frames.{" "}
            <span style={{ color: "var(--text-muted)" }}>
              Scene detection · Keyframe extraction · MCP integration
            </span>
          </p>
        </div>

        {/* Upload zone */}
        <section>
          <UploadDropzone
            onUploading={() => {
              void fetchProjects();
            }}
          />
        </section>

        {/* Project list */}
        {!loading && projects.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium tracking-widest uppercase"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                Projects
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                {projects.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onDelete={(id) => setProjects((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state (after loading, no projects) */}
        {!loading && projects.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-8 gap-2 text-center"
            aria-hidden="true"
          >
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              No projects yet
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              Upload a video to get started
            </span>
          </div>
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
          powered by{" "}
          <span style={{ color: "#f59e0b" }}>Claude</span>
        </span>
      </footer>
    </div>
  );
}
