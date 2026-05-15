"use client";

import { useState } from "react";

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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="3" x2="11" y2="11" />
      <line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  );
}

function SeekIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="5" />
      <polygon points="5,4.5 9,6.5 5,8.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,3.5 11,3.5" />
      <path d="M4.5,3.5V2.5h4V3.5" />
      <path d="M3,3.5l0.7,7.5h5.6L10,3.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="6.5" x2="10" y2="6.5" />
      <polyline points="7,3.5 10,6.5 7,9.5" />
    </svg>
  );
}

export function CaptureStrip({
  captures,
  onSeek,
  onDelete,
  onSend,
  sending,
}: CaptureStripProps) {
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const preview = previewIdx !== null ? captures.find((c) => c.idx === previewIdx) ?? null : null;

  function closePreview() {
    setPreviewIdx(null);
  }

  function handleSeekFromModal() {
    if (preview) {
      onSeek(preview.t);
      closePreview();
    }
  }

  function handleDeleteFromModal() {
    if (preview) {
      onDelete(preview.idx);
      closePreview();
    }
  }

  return (
    <>
      {/* Preview modal */}
      {preview && (
        <div
          onClick={closePreview}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface, #1a1a1a)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              overflow: "hidden",
              maxWidth: "min(90vw, 720px)",
              width: "100%",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                gap: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  flex: 1,
                }}
              >
                Frame #{preview.idx} · {fmtTime(preview.t)} · {fmtBytes(preview.bytes)}
              </span>
              <button
                onClick={closePreview}
                aria-label="Close preview"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={`Frame ${preview.idx}`}
              style={{ width: "100%", display: "block", maxHeight: "60vh", objectFit: "contain", background: "#000" }}
            />

            {/* Modal actions */}
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "12px 14px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                onClick={handleSeekFromModal}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.8)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  cursor: "pointer",
                  transition: "background 150ms",
                }}
              >
                <SeekIcon />
                Seek to {fmtTime(preview.t)}
              </button>
              <button
                onClick={handleDeleteFromModal}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 6,
                  border: "1px solid rgba(220,38,38,0.4)",
                  background: "rgba(220,38,38,0.08)",
                  color: "#f87171",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  cursor: "pointer",
                  transition: "background 150ms",
                  marginLeft: "auto",
                }}
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
          overflowX: "auto",
          flexShrink: 0,
          minHeight: 96,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
            flexShrink: 0,
            writingMode: "horizontal-tb",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {captures.length === 0 ? "No captures" : `${captures.length} frame${captures.length === 1 ? "" : "s"}`}
        </span>

        {captures.map((c) => (
          <div
            key={c.idx}
            style={{
              position: "relative",
              flexShrink: 0,
              width: 108,
              height: 68,
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.12)",
              cursor: "pointer",
              transition: "border-color 150ms, transform 150ms",
            }}
            title={`Frame #${c.idx} · ${fmtTime(c.t)} · ${fmtBytes(c.bytes)}\nClick to preview`}
            onClick={() => setPreviewIdx(c.idx)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(245,158,11,0.5)";
              (e.currentTarget as HTMLElement).style.transform = "scale(1.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
              (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.url}
              alt={`capture ${c.idx}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {/* Time badge */}
            <span
              style={{
                position: "absolute",
                bottom: 3,
                left: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "#fff",
                background: "rgba(0,0,0,0.65)",
                padding: "1px 4px",
                borderRadius: 3,
                letterSpacing: "0.02em",
                pointerEvents: "none",
              }}
            >
              {fmtTime(c.t)}
            </span>
            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.idx);
              }}
              aria-label={`delete frame ${c.idx}`}
              style={{
                position: "absolute",
                top: 3,
                right: 3,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.72)",
                color: "rgba(255,255,255,0.8)",
                border: "none",
                fontSize: 12,
                lineHeight: "18px",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 150ms",
              }}
            >
              ×
            </button>
          </div>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          {captures.length > 0 && !sending && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.04em",
            }}>
              deletes source · keeps snippets
            </span>
          )}
          <button
            onClick={onSend}
            disabled={sending || captures.length === 0}
            title="Send compressed snippets to Claude. Source video will be deleted to free disk space; snippets remain on disk."
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 18px",
              borderRadius: 6,
              border:
                captures.length === 0 || sending
                  ? "1px solid rgba(245,158,11,0.15)"
                  : "1px solid rgba(245,158,11,0.5)",
              background: "transparent",
              color: captures.length === 0 || sending ? "rgba(245,158,11,0.3)" : "#f59e0b",
              cursor: captures.length === 0 || sending ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 700,
              transition: "all 150ms",
              letterSpacing: "0.02em",
              boxShadow:
                captures.length === 0 || sending ? "none" : "0 1px 4px rgba(245,158,11,0.15)",
              userSelect: "none",
            }}
          >
            <SendIcon />
            {sending ? "Sending…" : `Send ${captures.length > 0 ? `(${captures.length})` : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}
