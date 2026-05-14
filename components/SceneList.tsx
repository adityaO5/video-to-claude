"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scene {
  id: number;
  start: number;
  end: number;
  startFrame: number;
  endFrame: number;
  label?: string;
}

export interface RefinedScene {
  start: number;
  end: number;
  label?: string;
}

export interface SceneListProps {
  projectId: string;
  scenes: Scene[];
  refined: boolean;
  onRefine: (scenes: RefinedScene[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

function parseDuration(seconds: number): string {
  return `${(seconds).toFixed(1)}s`;
}

interface EditableRow {
  start: number;
  end: number;
  label: string;
  editingStart: boolean;
  editingEnd: boolean;
  startInput: string;
  endInput: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SceneList({ projectId, scenes, refined, onRefine }: SceneListProps) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    scenes.map((s) => ({
      start: s.start,
      end: s.end,
      label: s.label ?? "",
      editingStart: false,
      editingEnd: false,
      startInput: formatTime(s.start),
      endInput: formatTime(s.end),
    }))
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function parseTimeInput(val: string): number | null {
    // Accepts MM:SS.s or raw seconds
    const colonMatch = /^(\d+):(\d+(?:\.\d+)?)$/.exec(val.trim());
    if (colonMatch) {
      return parseInt(colonMatch[1], 10) * 60 + parseFloat(colonMatch[2]);
    }
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  }

  function commitStartEdit(idx: number) {
    const parsed = parseTimeInput(rows[idx].startInput);
    if (parsed !== null && parsed >= 0) {
      updateRow(idx, { start: parsed, editingStart: false, startInput: formatTime(parsed) });
    } else {
      updateRow(idx, { editingStart: false, startInput: formatTime(rows[idx].start) });
    }
  }

  function commitEndEdit(idx: number) {
    const parsed = parseTimeInput(rows[idx].endInput);
    if (parsed !== null && parsed > rows[idx].start) {
      updateRow(idx, { end: parsed, editingEnd: false, endInput: formatTime(parsed) });
    } else {
      updateRow(idx, { editingEnd: false, endInput: formatTime(rows[idx].end) });
    }
  }

  function mergeWithNext(idx: number) {
    if (idx >= rows.length - 1) return;
    setRows((prev) => {
      const next = [...prev];
      const merged: EditableRow = {
        ...next[idx],
        end: next[idx + 1].end,
        endInput: formatTime(next[idx + 1].end),
      };
      next.splice(idx, 2, merged);
      return next;
    });
  }

  function deleteRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRow() {
    const lastEnd = rows.length > 0 ? rows[rows.length - 1].end : 0;
    const newStart = lastEnd;
    const newEnd = lastEnd + 30;
    setRows((prev) => [
      ...prev,
      {
        start: newStart,
        end: newEnd,
        label: "",
        editingStart: false,
        editingEnd: false,
        startInput: formatTime(newStart),
        endInput: formatTime(newEnd),
      },
    ]);
  }

  async function saveRefinements() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const payload = rows.map((r) => ({
        start: r.start,
        end: r.end,
        ...(r.label ? { label: r.label } : {}),
      }));
      const res = await fetch(`/api/projects/${projectId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: payload }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onRefine(payload);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium tracking-widest uppercase"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Scenes
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              color: "#f59e0b",
              background: "rgba(245,158,11,0.1)",
              border: "1px solid rgba(245,158,11,0.2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {rows.length}
          </span>
          {refined && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                color: "#34d399",
                background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              refined
            </span>
          )}
        </div>
        <button
          onClick={addRow}
          className="text-xs px-2.5 py-1 rounded transition-colors duration-150"
          style={{
            color: "#f59e0b",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.15)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.08)";
          }}
        >
          + Add scene
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "var(--font-mono)", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["#", "Start", "End", "Duration", "Label", "Actions"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={idx}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                {/* # */}
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {idx + 1}
                </td>

                {/* Start */}
                <td className="px-3 py-2">
                  {row.editingStart ? (
                    <input
                      autoFocus
                      value={row.startInput}
                      onChange={(e) => updateRow(idx, { startInput: e.target.value })}
                      onBlur={() => commitStartEdit(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitStartEdit(idx);
                        if (e.key === "Escape") updateRow(idx, { editingStart: false, startInput: formatTime(row.start) });
                      }}
                      className="rounded px-1.5 py-0.5 text-xs outline-none w-20"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid rgba(245,158,11,0.4)",
                        color: "var(--text)",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => updateRow(idx, { editingStart: true })}
                      className="hover:underline text-left"
                      style={{ color: "var(--text)", background: "transparent", border: "none", cursor: "text", fontFamily: "var(--font-mono)" }}
                    >
                      {formatTime(row.start)}
                    </button>
                  )}
                </td>

                {/* End */}
                <td className="px-3 py-2">
                  {row.editingEnd ? (
                    <input
                      autoFocus
                      value={row.endInput}
                      onChange={(e) => updateRow(idx, { endInput: e.target.value })}
                      onBlur={() => commitEndEdit(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEndEdit(idx);
                        if (e.key === "Escape") updateRow(idx, { editingEnd: false, endInput: formatTime(row.end) });
                      }}
                      className="rounded px-1.5 py-0.5 text-xs outline-none w-20"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid rgba(245,158,11,0.4)",
                        color: "var(--text)",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => updateRow(idx, { editingEnd: true })}
                      className="hover:underline text-left"
                      style={{ color: "var(--text)", background: "transparent", border: "none", cursor: "text", fontFamily: "var(--font-mono)" }}
                    >
                      {formatTime(row.end)}
                    </button>
                  )}
                </td>

                {/* Duration */}
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {parseDuration(row.end - row.start)}
                </td>

                {/* Label */}
                <td className="px-3 py-2">
                  <input
                    value={row.label}
                    onChange={(e) => updateRow(idx, { label: e.target.value })}
                    placeholder="optional label"
                    className="rounded px-1.5 py-0.5 text-xs outline-none w-28"
                    style={{
                      background: "transparent",
                      border: "1px solid transparent",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => {
                      (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(245,158,11,0.35)";
                      (e.currentTarget as HTMLInputElement).style.background = "var(--surface-2)";
                    }}
                    onBlur={(e) => {
                      (e.currentTarget as HTMLInputElement).style.borderColor = "transparent";
                      (e.currentTarget as HTMLInputElement).style.background = "transparent";
                    }}
                  />
                </td>

                {/* Actions */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {idx < rows.length - 1 && (
                      <button
                        onClick={() => mergeWithNext(idx)}
                        title="Merge with next"
                        className="px-1.5 py-0.5 rounded text-xs transition-colors duration-150"
                        style={{
                          color: "var(--text-muted)",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                        }}
                      >
                        merge
                      </button>
                    )}
                    <button
                      onClick={() => deleteRow(idx)}
                      title="Delete scene"
                      className="px-1.5 py-0.5 rounded text-xs transition-colors duration-150"
                      style={{
                        color: "rgba(248,113,113,0.6)",
                        background: "rgba(248,113,113,0.06)",
                        border: "1px solid rgba(248,113,113,0.15)",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.12)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,113,113,0.6)";
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.06)";
                      }}
                    >
                      del
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--text-muted)" }}>
                  No scenes — add one above
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3 gap-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div>
          {saveError && (
            <span className="text-xs" style={{ color: "#f87171", fontFamily: "var(--font-mono)" }}>
              {saveError}
            </span>
          )}
          {saved && (
            <span className="text-xs" style={{ color: "#34d399", fontFamily: "var(--font-mono)" }}>
              Refinements saved
            </span>
          )}
        </div>
        <button
          onClick={() => void saveRefinements()}
          disabled={saving || rows.length === 0}
          className="text-xs px-3 py-1.5 rounded transition-all duration-150"
          style={{
            background: saving ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.3)",
            color: saving ? "rgba(245,158,11,0.5)" : "#f59e0b",
            cursor: saving || rows.length === 0 ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono)",
            opacity: rows.length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? "Saving..." : "Save refinements"}
        </button>
      </div>
    </div>
  );
}
