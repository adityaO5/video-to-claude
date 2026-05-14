"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnippetCopyProps {
  projectId: string;
  sceneId?: number;
  segId?: number;
  label?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPaths(snippet: string): string {
  const lines = snippet.split("\n");
  const paths: string[] = [];
  for (const line of lines) {
    // Match lines that look like file paths (absolute paths starting with / or drive letter)
    const trimmed = line.trim();
    if (/^([A-Za-z]:[/\\]|\/)[^\s]+\.(webp|png|jpg|jpeg)/i.test(trimmed)) {
      paths.push(trimmed);
    } else if (/\b([A-Za-z]:[/\\][^\s,]+\.(webp|png|jpg|jpeg))/i.test(trimmed)) {
      const match = /([A-Za-z]:[/\\][^\s,]+\.(webp|png|jpg|jpeg))/i.exec(trimmed);
      if (match) paths.push(match[1]);
    } else if (/\/([\w/.]+\.(webp|png|jpg|jpeg))/i.test(trimmed)) {
      const match = /(\/[\w/.\\-]+\.(webp|png|jpg|jpeg))/i.exec(trimmed);
      if (match) paths.push(match[1]);
    }
  }
  return paths.join("\n");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SnippetCopy({ projectId, sceneId, segId, label }: SnippetCopyProps) {
  const [snippet, setSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPaths, setCopiedPaths] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sceneId !== undefined) params.set("scene", String(sceneId));
    if (segId !== undefined) params.set("seg", String(segId));
    const url = `/api/projects/${projectId}/snippet${params.toString() ? `?${params.toString()}` : ""}`;

    setLoading(true);
    setError(null);

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((text) => setSnippet(text))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [projectId, sceneId, segId]);

  async function copyToClipboard(text: string, kind: "main" | "paths") {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "main") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopiedPaths(true);
        setTimeout(() => setCopiedPaths(false), 2000);
      }
    } catch {
      // fallback: select textarea
    }
  }

  const title = label
    ? label
    : sceneId !== undefined && segId !== undefined
      ? `Scene ${sceneId + 1} · Seg ${segId + 1}`
      : sceneId !== undefined
        ? `Scene ${sceneId + 1}`
        : "All frames";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {title}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (snippet) void copyToClipboard(extractPaths(snippet), "paths");
            }}
            disabled={!snippet}
            className="text-xs px-2 py-1 rounded transition-all duration-150"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              color: copiedPaths ? "#34d399" : "var(--text-muted)",
              cursor: snippet ? "pointer" : "not-allowed",
              fontFamily: "var(--font-mono)",
            }}
          >
            {copiedPaths ? "Copied!" : "Copy all paths"}
          </button>
          <button
            onClick={() => {
              if (snippet) void copyToClipboard(snippet, "main");
            }}
            disabled={!snippet}
            className="text-xs px-2.5 py-1 rounded transition-all duration-150"
            style={{
              background: copied ? "rgba(52,211,153,0.12)" : "rgba(245,158,11,0.1)",
              border: copied
                ? "1px solid rgba(52,211,153,0.3)"
                : "1px solid rgba(245,158,11,0.25)",
              color: copied ? "#34d399" : "#f59e0b",
              cursor: snippet ? "pointer" : "not-allowed",
              fontFamily: "var(--font-mono)",
            }}
          >
            {copied ? "Copied!" : "Copy for Claude Code"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {loading && (
          <div
            className="text-xs py-3 text-center"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Loading snippet...
          </div>
        )}
        {error && (
          <div
            className="text-xs py-2 rounded px-3"
            style={{
              color: "#f87171",
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.15)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {error}
          </div>
        )}
        {snippet && !loading && (
          <textarea
            readOnly
            value={snippet}
            rows={8}
            className="w-full rounded text-xs resize-y outline-none"
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
              padding: "10px 12px",
              lineHeight: "1.6",
            }}
          />
        )}
      </div>
    </div>
  );
}
