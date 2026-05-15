"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  AnnotationTool,
  Shape,
  ArrowShape,
  RectShape,
  FreehandShape,
} from "@/lib/annotateSvg";

interface TimelinePlayerProps {
  sessionId: string;
  videoSrc: string;
  duration: number;
  nativeW: number;
  nativeH: number;
  onCaptureSaved: (cap: {
    idx: number;
    t: number;
    bytes: number;
    url: string;
  }) => void;
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

function drawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  provisional?: Partial<Shape> | null
) {
  const COLOR = "#ef4444";
  const STROKE = Math.max(2, ctx.canvas.width / 480);
  const FONT = Math.max(14, Math.round(ctx.canvas.width / 60));

  ctx.save();
  ctx.strokeStyle = COLOR;
  ctx.fillStyle = COLOR;
  ctx.lineWidth = STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.font = `bold ${FONT}px monospace`;

  const all: Array<Shape | Partial<Shape>> = [...shapes];
  if (provisional) all.push(provisional);

  for (const s of all) {
    if (!s.type) continue;
    if (s.type === "arrow") {
      const a = s as Partial<ArrowShape>;
      if (a.x1 == null || a.y1 == null || a.x2 == null || a.y2 == null) continue;
      const dx = a.x2 - a.x1;
      const dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const ux = dx / len;
      const uy = dy / len;
      const head = Math.max(10, STROKE * 4);
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2 - ux * head * 0.5, a.y2 - uy * head * 0.5);
      ctx.stroke();
      ctx.beginPath();
      const perpX = -uy;
      const perpY = ux;
      ctx.moveTo(a.x2, a.y2);
      ctx.lineTo(a.x2 - ux * head + perpX * head * 0.4, a.y2 - uy * head + perpY * head * 0.4);
      ctx.lineTo(a.x2 - ux * head - perpX * head * 0.4, a.y2 - uy * head - perpY * head * 0.4);
      ctx.closePath();
      ctx.fill();
    } else if (s.type === "rect") {
      const r = s as Partial<RectShape>;
      if (r.x == null || r.y == null || r.w == null || r.h == null) continue;
      ctx.save();
      ctx.fillStyle = "rgba(239,68,68,0.08)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    } else if (s.type === "text") {
      const t = s as { type: "text"; x?: number; y?: number; value?: string };
      if (t.x == null || t.y == null || !t.value) continue;
      ctx.save();
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 4;
      ctx.fillStyle = COLOR;
      ctx.fillText(t.value, t.x, t.y);
      ctx.restore();
    } else if (s.type === "freehand") {
      const f = s as Partial<FreehandShape>;
      if (!f.points || f.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(f.points[0].x, f.points[0].y);
      for (let i = 1; i < f.points.length; i++) ctx.lineTo(f.points[i].x, f.points[i].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function TimelinePlayer({
  sessionId,
  videoSrc,
  duration,
  nativeW,
  nativeH,
  onCaptureSaved,
}: TimelinePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<Partial<Shape> | null>(null);

  const [tool, setTool] = useState<AnnotationTool>("arrow");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [, force] = useState(0);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textRef = useRef<HTMLInputElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0, x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      const aspect = nativeW / nativeH;
      let w = r.width;
      let h = r.width / aspect;
      if (h > r.height) {
        h = r.height;
        w = r.height * aspect;
      }
      setStageSize({
        w: Math.round(w),
        h: Math.round(h),
        x: Math.round((r.width - w) / 2),
        y: Math.round((r.height - h) / 2),
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nativeW, nativeH]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawShapes(ctx, shapes, drawingRef.current);
  }, [shapes]);

  useEffect(() => {
    redraw();
  }, [redraw, stageSize]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, []);

  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const p = canvasPoint(e);
    if (tool === "text") {
      setTextInput(p);
      setTextValue("");
      setTimeout(() => textRef.current?.focus(), 30);
      return;
    }
    if (tool === "arrow") drawingRef.current = { type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    else if (tool === "rect") drawingRef.current = { type: "rect", x: p.x, y: p.y, w: 0, h: 0 };
    else if (tool === "freehand") drawingRef.current = { type: "freehand", points: [p] };
    force((n) => n + 1);
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    const d = drawingRef.current;
    if (d.type === "arrow") {
      (d as Partial<ArrowShape>).x2 = p.x;
      (d as Partial<ArrowShape>).y2 = p.y;
    } else if (d.type === "rect") {
      const r = d as Partial<RectShape>;
      r.w = p.x - (r.x ?? 0);
      r.h = p.y - (r.y ?? 0);
    } else if (d.type === "freehand") {
      (d as Partial<FreehandShape>).points?.push(p);
    }
    redraw();
  }

  function onUp() {
    const d = drawingRef.current;
    if (!d) return;
    drawingRef.current = null;
    setShapes((prev) => [...prev, d as Shape]);
  }

  function commitText() {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      return;
    }
    setShapes((prev) => [
      ...prev,
      { type: "text", x: textInput.x, y: textInput.y + 4, value: textValue.trim() },
    ]);
    setTextInput(null);
    setTextValue("");
  }

  function undo() {
    setShapes((p) => p.slice(0, -1));
  }
  function clearAll() {
    setShapes([]);
  }

  async function capture() {
    if (capturing) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    setCapturing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          t: v.currentTime,
          displayW: c.width,
          displayH: c.height,
          shapes,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string;
        };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const cap = (await res.json()) as {
        idx: number;
        t: number;
        bytes: number;
        url: string;
      };
      setShapes([]);
      drawingRef.current = null;
      onCaptureSaved(cap);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCapturing(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (textInput) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "ArrowLeft") {
        const v = videoRef.current;
        if (!v) return;
        const step = e.shiftKey ? 1 / 30 : 0.1;
        v.currentTime = Math.max(0, v.currentTime - step);
      } else if (e.key === "ArrowRight") {
        const v = videoRef.current;
        if (!v) return;
        const step = e.shiftKey ? 1 / 30 : 0.1;
        v.currentTime = Math.min(duration, v.currentTime + step);
      } else if (e.key.toLowerCase() === "c") {
        void capture();
      } else if (e.key === "Escape") {
        drawingRef.current = null;
        force((n) => n + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, textInput, shapes, sessionId]);

  const drawActive = tool !== "text" || textInput !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {(["arrow", "rect", "text", "freehand"] as AnnotationTool[]).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border:
                tool === t
                  ? "1px solid rgba(245,158,11,0.6)"
                  : "1px solid var(--border)",
              background: tool === t ? "rgba(245,158,11,0.15)" : "transparent",
              color: tool === t ? "#f59e0b" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
        <button onClick={undo} style={btnStyle}>undo</button>
        <button onClick={clearAll} style={btnStyle}>clear</button>

        <button
          onClick={capture}
          disabled={capturing}
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            borderRadius: 4,
            border: "1px solid rgba(245,158,11,0.6)",
            background: capturing ? "rgba(245,158,11,0.05)" : "rgba(245,158,11,0.2)",
            color: "#f59e0b",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            cursor: capturing ? "not-allowed" : "pointer",
          }}
        >
          {capturing ? "…" : "● Capture (c)"}
        </button>
      </div>

      <div
        ref={stageRef}
        style={{
          flex: 1,
          position: "relative",
          background: "#000",
          overflow: "hidden",
        }}
      >
        {stageSize.w > 0 && (
          <>
            <video
              ref={videoRef}
              src={videoSrc}
              controls={false}
              preload="auto"
              style={{
                position: "absolute",
                left: stageSize.x,
                top: stageSize.y,
                width: stageSize.w,
                height: stageSize.h,
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={canvasRef}
              width={stageSize.w}
              height={stageSize.h}
              style={{
                position: "absolute",
                left: stageSize.x,
                top: stageSize.y,
                cursor: drawActive ? "crosshair" : "default",
                touchAction: "none",
              }}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
            />
            {textInput && (
              <input
                ref={textRef}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") {
                    setTextInput(null);
                    setTextValue("");
                  }
                }}
                onBlur={commitText}
                style={{
                  position: "absolute",
                  left: stageSize.x + textInput.x,
                  top: stageSize.y + textInput.y - 18,
                  background: "rgba(0,0,0,0.75)",
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  fontFamily: "monospace",
                  fontSize: 14,
                  padding: "2px 6px",
                  borderRadius: 4,
                  outline: "none",
                  zIndex: 10,
                }}
                placeholder="type + enter"
              />
            )}
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <button
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) void v.play();
            else v.pause();
          }}
          style={btnStyle}
        >
          ⏵ / ⏸
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", minWidth: 50 }}>
          {fmtTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={currentTime}
          onChange={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = Number(e.target.value);
          }}
          style={{ flex: 1 }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", minWidth: 50, textAlign: "right" }}>
          {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  cursor: "pointer",
};
