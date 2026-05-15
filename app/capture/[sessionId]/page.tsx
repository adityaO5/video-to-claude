"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UploadDropzone } from "@/components/UploadDropzone";
import { TimelinePlayer } from "@/components/capture/TimelinePlayer";
import { CaptureStrip } from "@/components/capture/CaptureStrip";
import type { CaptureSession } from "@/lib/captureSession";

type ClientCapture = {
  idx: number;
  t: number;
  bytes: number;
  url: string;
};

export default function CapturePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [session, setSession] = useState<CaptureSession | null>(null);
  const [captures, setCaptures] = useState<ClientCapture[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      setError(`Session load failed: ${res.status}`);
      return;
    }
    const s = (await res.json()) as CaptureSession;
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

  async function uploadSource(file: File) {
    const fd = new FormData();
    fd.append("video", file);
    const res = await fetch(`/api/sessions/${sessionId}/source`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
        error?: string;
      };
      throw new Error(e.error ?? `HTTP ${res.status}`);
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
    return (
      <div style={{ ...panelStyle, flexDirection: "column", gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✓</div>
        <span style={{ color: "#34d399", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>Sent to Claude</span>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {session.captures.length} frame{session.captures.length === 1 ? "" : "s"} delivered — you can close this tab.
        </span>
      </div>
    );
  }

  if (session.status === "waiting" || !session.source) {
    return (
      <div style={{ ...panelStyle, flexDirection: "column", gap: 16, padding: 32 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
          claude listening · {sessionId}
        </span>
        <UploadDropzone onUploadOverride={uploadSource} />
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
