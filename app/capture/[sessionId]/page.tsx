"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UploadDropzone, type UploadProgress } from "@/components/UploadDropzone";
import { TimelinePlayer } from "@/components/capture/TimelinePlayer";
import { CaptureStrip } from "@/components/capture/CaptureStrip";
import type { CaptureSession } from "@/lib/captureSession";

type ClientCapture = {
  idx: number;
  t: number;
  bytes: number;
  url: string;
};

type SessionWithPaths = CaptureSession & {
  capturesPath?: string;
  sessionPath?: string;
};

export default function CapturePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [session, setSession] = useState<SessionWithPaths | null>(null);
  const [captures, setCaptures] = useState<ClientCapture[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      setError(`Session load failed: ${res.status}`);
      return;
    }
    const s = (await res.json()) as SessionWithPaths;
    setSession(s);
    setCaptures(
      s.captures.map((c) => ({
        idx: c.idx,
        t: c.t,
        bytes: c.bytes,
        url: `/api/sessions/${sessionId}/captures/${c.idx}`,
      }))
    );
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function uploadSource(file: File, onProgress: (p: UploadProgress) => void) {
    const CHUNK_SIZE = 8 * 1024 * 1024;
    const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const mime = file.type || "video/mp4";

    for (let i = 0; i < total; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);

      const res = await fetch(`/api/sessions/${sessionId}/source/chunk`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-chunk-index": String(i),
          "x-chunk-total": String(total),
          "x-file-name": file.name,
          "x-file-mime": mime,
        },
        body: blob,
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string;
        };
        throw new Error(e.error ?? `chunk ${i} failed: HTTP ${res.status}`);
      }

      onProgress({
        pct: end / file.size,
        uploadedBytes: end,
        totalBytes: file.size,
        phase: "uploading",
      });
    }

    onProgress({
      pct: 1,
      uploadedBytes: file.size,
      totalBytes: file.size,
      phase: "probing",
    });

    const finalRes = await fetch(`/api/sessions/${sessionId}/source/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: file.name, mime }),
    });
    if (!finalRes.ok) {
      const e = (await finalRes.json().catch(() => ({ error: `HTTP ${finalRes.status}` }))) as {
        error?: string;
      };
      throw new Error(e.error ?? `finalize failed: HTTP ${finalRes.status}`);
    }
    await reload();
  }

  async function deleteCapture(idx: number) {
    const res = await fetch(`/api/sessions/${sessionId}/captures/${idx}`, {
      method: "DELETE",
    });
    if (res.ok) await reload();
  }

  async function send() {
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/send`, { method: "POST" });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string;
        };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return <div style={panelStyle}><span style={{ color: "#ef4444" }}>{error}</span></div>;
  }
  if (!session) {
    return <div style={panelStyle}>loading…</div>;
  }

  if (session.status === "sent") {
    const stats = (session as CaptureSession & { compressionStats?: { originalTotalBytes: number; compressedTotalBytes: number; savedBytes: number } }).compressionStats;
    const fmtKB = (b: number) => `${(b / 1024).toFixed(0)} KB`;
    return (
      <div style={{ ...panelStyle, flexDirection: "column", gap: 12 }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(52,211,153,0.08)",
          border: "1px solid rgba(52,211,153,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,12 9,17 18,6" />
          </svg>
        </div>
        <span style={{ color: "#f5f5f7", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
          Sent to Claude
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {session.captures.length} frame{session.captures.length === 1 ? "" : "s"} delivered — you can close this tab.
        </span>
        {stats && (
          <div style={{
            marginTop: 4,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid rgba(52,211,153,0.15)",
            background: "rgba(52,211,153,0.05)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "rgba(52,211,153,0.7)",
            textAlign: "center",
          }}>
            {fmtKB(stats.originalTotalBytes)} → {fmtKB(stats.compressedTotalBytes)}
            <span style={{ color: "rgba(52,211,153,0.45)", marginLeft: 6 }}>
              ({fmtKB(stats.savedBytes)} saved)
            </span>
          </div>
        )}

        {/* Storage notice + folder path */}
        <div style={{
          marginTop: 12,
          maxWidth: 520,
          width: "100%",
          padding: "14px 16px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(245,158,11,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="2,4.5 14,4.5" />
              <path d="M5.5,4.5V3h5V4.5" />
              <path d="M3.5,4.5l0.9,9.5h7.2L12.5,4.5" />
            </svg>
            <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              <strong style={{ color: "#f5f5f7", fontWeight: 600 }}>Source video deleted</strong> to free disk space.
              Your {session.captures.length} snippet{session.captures.length === 1 ? "" : "s"} stay on disk — find them here:
            </div>
          </div>
          {session.capturesPath && (
            <CopyablePath path={session.capturesPath} />
          )}
        </div>
      </div>
    );
  }

  if (session.status === "waiting" || !session.source) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "48px 24px",
        gap: 0,
      }}>
        {/* Retro logo */}
        <RetroLogo />

        {/* Headline */}
        <h1 style={{
          margin: "32px 0 0",
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.025em",
          color: "#f5f5f7",
          textAlign: "center",
        }}>
          Drop your recording
        </h1>

        {/* Subhead */}
        <p style={{
          margin: "8px 0 0",
          fontSize: 14,
          color: "var(--text-muted)",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 340,
        }}>
          Scrub the timeline, annotate frames, send to Claude
        </p>

        {/* Session badge */}
        <div style={{
          marginTop: 20,
          marginBottom: 32,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.03)",
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#34d399",
            display: "inline-block",
            boxShadow: "0 0 6px rgba(52,211,153,0.6)",
          }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.03em" }}>
            claude · {sessionId}
          </span>
        </div>

        <div style={{ width: "100%", maxWidth: 420 }}>
          <UploadDropzone onUploadOverride={uploadSource} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <TimelinePlayer
        sessionId={sessionId}
        videoSrc={`/api/sessions/${sessionId}/source-stream`}
        duration={session.source.duration}
        nativeW={session.source.width}
        nativeH={session.source.height}
        onCaptureSaved={(c) => setCaptures((prev) => [...prev, c])}
      />
      <CaptureStrip
        captures={captures}
        onSeek={(t) => {
          const v = document.querySelector("video");
          if (v) v.currentTime = t;
        }}
        onDelete={(idx) => void deleteCapture(idx)}
        onSend={() => void send()}
        sending={sending}
      />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "var(--bg)",
  color: "var(--text)",
};

function CopyablePath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 10px",
      borderRadius: 6,
      background: "rgba(0,0,0,0.35)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <code style={{
        flex: 1,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "rgba(255,255,255,0.8)",
        wordBreak: "break-all",
        lineHeight: 1.4,
      }}>
        {path}
      </code>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(path);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          } catch { /* ignore */ }
        }}
        style={{
          flexShrink: 0,
          padding: "4px 10px",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: copied ? "#34d399" : "rgba(245,158,11,0.85)",
          background: copied ? "rgba(52,211,153,0.08)" : "rgba(245,158,11,0.08)",
          border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "rgba(245,158,11,0.3)"}`,
          borderRadius: 4,
          cursor: "pointer",
          transition: "all 150ms",
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
  );
}

function RetroLogo() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        userSelect: "none",
      }}
    >
      {/* Sun + horizon stack */}
      <div
        style={{
          position: "relative",
          width: 168,
          height: 84,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Sun */}
        <div
          style={{
            position: "absolute",
            bottom: 14,
            width: 88,
            height: 88,
            borderRadius: "50%",
            background:
              "linear-gradient(180deg, #fbbf24 0%, #f59e0b 35%, #ec4899 75%, #a855f7 100%)",
            boxShadow:
              "0 0 28px rgba(245,158,11,0.45), 0 0 50px rgba(236,72,153,0.25)",
          }}
        />
        {/* Horizontal scan lines over sun (retro stripes) */}
        <div
          style={{
            position: "absolute",
            bottom: 14,
            width: 88,
            height: 44,
            background:
              "repeating-linear-gradient(180deg, transparent 0 5px, var(--bg) 5px 8px)",
            borderBottomLeftRadius: 44,
            borderBottomRightRadius: 44,
            pointerEvents: "none",
          }}
        />
        {/* Grid horizon */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 14,
            perspective: "60px",
            transformStyle: "preserve-3d",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: "rotateX(55deg)",
              transformOrigin: "bottom center",
              backgroundImage:
                "linear-gradient(90deg, #f59e0b 1px, transparent 1px), linear-gradient(0deg, #f59e0b 1px, transparent 1px)",
              backgroundSize: "16px 8px",
              opacity: 0.55,
            }}
          />
        </div>
      </div>

      {/* Wordmark with chromatic offset */}
      <div
        style={{
          position: "relative",
          fontFamily: "var(--font-mono)",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.18em",
          lineHeight: 1,
          marginTop: 4,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            color: "#ec4899",
            transform: "translate(-1.5px, 0)",
            mixBlendMode: "screen",
            opacity: 0.8,
          }}
        >
          VIDEO ▸ CLAUDE
        </span>
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            color: "#06b6d4",
            transform: "translate(1.5px, 0)",
            mixBlendMode: "screen",
            opacity: 0.8,
          }}
        >
          VIDEO ▸ CLAUDE
        </span>
        <span
          style={{
            position: "relative",
            background:
              "linear-gradient(180deg, #ffffff 0%, #fde68a 50%, #f59e0b 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 12px rgba(245,158,11,0.25)",
          }}
        >
          VIDEO ▸ CLAUDE
        </span>
      </div>

      {/* Subtitle ribbon */}
      <div
        style={{
          marginTop: 4,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.4em",
          color: "rgba(245,158,11,0.55)",
          textTransform: "uppercase",
        }}
      >
        ▰ frame · capture · ship ▰
      </div>
    </div>
  );
}
