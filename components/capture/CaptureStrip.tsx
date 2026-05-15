"use client";

interface StripCapture {
  idx: number;
  t: number;
  url: string;
  bytes: number;
}

interface CaptureStripProps {
  captures: StripCapture[];
  onSeek: (t: number) => void;
  onDelete: (idx: number) => void;
  onSend: () => void;
  sending: boolean;
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function CaptureStrip({
  captures,
  onSeek,
  onDelete,
  onSend,
  sending,
}: CaptureStripProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        overflowX: "auto",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-muted)",
          flexShrink: 0,
        }}
      >
        captures ({captures.length})
      </span>

      {captures.map((c) => (
        <div
          key={c.idx}
          style={{
            position: "relative",
            flexShrink: 0,
            width: 80,
            height: 45,
            borderRadius: 4,
            overflow: "hidden",
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
          title={`${fmtTime(c.t)} · ${fmtBytes(c.bytes)}`}
          onClick={() => onSeek(c.t)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.url}
            alt={`capture ${c.idx}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(c.idx);
            }}
            aria-label={`delete capture ${c.idx}`}
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              border: "none",
              fontSize: 11,
              lineHeight: "16px",
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button
        onClick={onSend}
        disabled={sending || captures.length === 0}
        style={{
          marginLeft: "auto",
          flexShrink: 0,
          padding: "6px 14px",
          borderRadius: 4,
          border: "1px solid rgba(245,158,11,0.6)",
          background:
            captures.length === 0 || sending
              ? "rgba(245,158,11,0.05)"
              : "rgba(245,158,11,0.15)",
          color: "#f59e0b",
          cursor: captures.length === 0 || sending ? "not-allowed" : "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {sending ? "Sending…" : `Send (${captures.length}) →`}
      </button>
    </div>
  );
}
