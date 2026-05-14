"use client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FrameMeta {
  idx: number;
  path: string;
  t: number;
  width: number;
  height: number;
  bytes: number;
}

export interface FrameStripProps {
  projectId: string;
  sceneId: number;
  segId: number;
  frames: FrameMeta[];
  onSeek?: (t: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

function extractFilename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FrameStrip({ projectId, sceneId, segId, frames, onSeek }: FrameStripProps) {
  const sceneDir = `scene_${sceneId.toString().padStart(3, "0")}`;
  const segDir = `seg_${segId.toString().padStart(3, "0")}`;

  if (frames.length === 0) {
    return (
      <div
        className="rounded px-3 py-4 text-xs text-center"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        No frames
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto"
      style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(245,158,11,0.2) transparent" }}
    >
      <div className="flex gap-2 pb-2" style={{ minWidth: "max-content" }}>
        {frames.map((frame) => {
          const filename = extractFilename(frame.path);
          const src = `/api/projects/${projectId}/frames/${sceneDir}/${segDir}/${filename}`;
          return (
            <a
              key={frame.idx}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 group flex-shrink-0"
              title={onSeek ? `t=${frame.t.toFixed(2)}s — click to seek` : `t=${frame.t.toFixed(2)}s — click to open full size`}
              style={onSeek ? { cursor: "pointer" } : undefined}
              onClick={onSeek ? (e) => { e.preventDefault(); onSeek(frame.t); } : undefined}
            >
              {/* Frame thumbnail */}
              <div
                className="rounded overflow-hidden relative"
                style={{
                  border: "1px solid var(--border)",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(245,158,11,0.5)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Frame at ${frame.t.toFixed(1)}s`}
                  width={120}
                  height={68}
                  className="block object-cover"
                  style={{ width: 120, height: 68, background: "var(--surface-2)" }}
                  loading="lazy"
                />
                {/* Hover overlay */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.5)" }}
                >
                  <span className="text-xs" style={{ color: "#f59e0b", fontFamily: "var(--font-mono)" }}>
                    open
                  </span>
                </div>
              </div>

              {/* Timestamp label */}
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                {formatTimestamp(frame.t)}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
