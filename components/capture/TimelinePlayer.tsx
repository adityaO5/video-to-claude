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
      // Word-wrap at canvas right edge
      const maxW = ctx.canvas.width - (t.x ?? 0) - 20;
      const lineH = FONT * 1.4;
      if (maxW > 40) {
        const words = t.value.split(" ");
        let line = "";
        let ly = t.y ?? 0;
        for (const word of words) {
          const test = line + word + " ";
          if (ctx.measureText(test).width > maxW && line !== "") {
            ctx.fillText(line.trimEnd(), t.x, ly);
            line = word + " ";
            ly += lineH;
          } else {
            line = test;
          }
        }
        if (line.trim()) ctx.fillText(line.trimEnd(), t.x, ly);
      } else {
        ctx.fillText(t.value, t.x, t.y);
      }
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

// SVG icons for annotation tools
function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="11" x2="11" y2="3" />
      <polyline points="6,3 11,3 11,8" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="2" width="10" height="10" rx="1.5" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="2" y="2.5" width="10" height="1.4" rx="0.7" />
      <rect x="6.3" y="2.5" width="1.4" height="9" rx="0.7" />
    </svg>
  );
}

function FreehandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 11 C4 8, 5 9, 7 7 C9 5, 9 4, 11 3" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7 C2 4 4 2 6.5 2 C9 2 11 4 11 6.5 C11 9 9 11 6.5 11" />
      <polyline points="2,4 2,7 5,7" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="3" y1="3" x2="10" y2="10" />
      <line x1="10" y1="3" x2="3" y2="10" />
    </svg>
  );
}

function CaptureIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <circle cx="6.5" cy="6.5" r="3" />
      <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <polygon points="2,1 11,6 2,11" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="1" width="3" height="10" rx="1" />
      <rect x="7" y="1" width="3" height="10" rx="1" />
    </svg>
  );
}

const TOOL_ICONS: Record<AnnotationTool, React.ReactNode> = {
  arrow: <ArrowIcon />,
  rect: <RectIcon />,
  text: <TextIcon />,
  freehand: <FreehandIcon />,
};

const TOOL_LABELS: Record<AnnotationTool, string> = {
  arrow: "Arrow",
  rect: "Box",
  text: "Text",
  freehand: "Draw",
};

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
  const isDraggingRef = useRef(false);
  const textDragging = useRef(false);
  const textDragStart = useRef<{ screenX: number; screenY: number; canvasX: number; canvasY: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    const onTime = () => {
      if (!isDraggingRef.current) setCurrentTime(v.currentTime);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoadedMeta = () => { setIsBuffering(false); setLoadError(null); };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => setIsBuffering(false);
    const onStalled = () => setIsBuffering(true);
    const onError = () => {
      const code = v.error?.code;
      const msg = code === 4
        ? "video format unsupported by browser"
        : code === 3
          ? "decode error"
          : code === 2
            ? "network error while loading video"
            : "video failed to load";
      setLoadError(msg);
      setIsBuffering(false);
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("error", onError);
    };
  }, []);

  // Force video to reload metadata when source URL changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setIsBuffering(true);
    setLoadError(null);
    v.load();
  }, [videoSrc]);

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

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch((err: unknown) => {
          console.warn("video.play() rejected:", err);
          setIsBuffering(false);
        });
      }
    } else {
      v.pause();
    }
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
        togglePlay();
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

  // Global drag handlers for repositioning text input overlay
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!textDragging.current || !textDragStart.current) return;
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const scaleX = c.width / r.width;
      const scaleY = c.height / r.height;
      const dx = (e.clientX - textDragStart.current.screenX) * scaleX;
      const dy = (e.clientY - textDragStart.current.screenY) * scaleY;
      setTextInput({
        x: Math.max(4, textDragStart.current.canvasX + dx),
        y: Math.max(20, textDragStart.current.canvasY + dy),
      });
    };
    const onUp = () => { textDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const drawActive = tool !== "text" || textInput !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Annotation toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        {/* Tool buttons */}
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {(["arrow", "rect", "text", "freehand"] as AnnotationTool[]).map((t) => {
            const active = tool === t;
            return (
              <button
                key={t}
                onClick={() => setTool(t)}
                title={TOOL_LABELS[t]}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: active
                    ? "1px solid rgba(245,158,11,0.7)"
                    : "1px solid rgba(255,255,255,0.1)",
                  background: active
                    ? "rgba(245,158,11,0.18)"
                    : "rgba(255,255,255,0.04)",
                  color: active ? "#f59e0b" : "rgba(255,255,255,0.75)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 150ms",
                  userSelect: "none",
                  boxShadow: active ? "0 0 0 1px rgba(245,158,11,0.2) inset" : "none",
                }}
              >
                {TOOL_ICONS[t]}
                {TOOL_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.12)", margin: "0 6px", flexShrink: 0 }} />

        {/* Undo / Clear */}
        <button
          onClick={undo}
          title="Undo last shape"
          style={secondaryBtnStyle}
        >
          <UndoIcon />
          Undo
        </button>
        <button
          onClick={clearAll}
          title="Clear all annotations"
          style={secondaryBtnStyle}
        >
          <ClearIcon />
          Clear
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Capture */}
        <button
          onClick={capture}
          disabled={capturing}
          title="Capture current frame (C)"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 16px",
            borderRadius: 6,
            border: "1px solid rgba(245,158,11,0.65)",
            background: capturing
              ? "rgba(245,158,11,0.06)"
              : "rgba(245,158,11,0.22)",
            color: capturing ? "rgba(245,158,11,0.5)" : "#f59e0b",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            cursor: capturing ? "not-allowed" : "pointer",
            transition: "all 150ms",
            letterSpacing: "0.02em",
            boxShadow: capturing ? "none" : "0 1px 3px rgba(245,158,11,0.15)",
            userSelect: "none",
          }}
        >
          <CaptureIcon />
          {capturing ? "Saving…" : "Capture"}
          {!capturing && (
            <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 2 }}>C</span>
          )}
        </button>
      </div>

      {/* Video stage */}
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
            {isBuffering && !loadError && (
              <div
                style={{
                  position: "absolute",
                  left: stageSize.x + stageSize.w / 2 - 18,
                  top: stageSize.y + stageSize.h / 2 - 18,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "2px solid rgba(245,158,11,0.25)",
                  borderTopColor: "#f59e0b",
                  animation: "spin 0.8s linear infinite",
                  pointerEvents: "none",
                }}
              />
            )}
            {loadError && (
              <div
                style={{
                  position: "absolute",
                  left: stageSize.x,
                  top: stageSize.y,
                  width: stageSize.w,
                  height: stageSize.h,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.75)",
                  color: "#ef4444",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  textAlign: "center",
                  padding: "0 24px",
                  pointerEvents: "none",
                }}
              >
                ⚠ {loadError}
              </div>
            )}
            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {textInput && (
              <div
                style={{
                  position: "absolute",
                  left: stageSize.x + textInput.x,
                  top: stageSize.y + textInput.y - 40,
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  userSelect: "none",
                }}
              >
                {/* Drag handle */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    textDragging.current = true;
                    textDragStart.current = {
                      screenX: e.clientX,
                      screenY: e.clientY,
                      canvasX: textInput.x,
                      canvasY: textInput.y,
                    };
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 6px",
                    background: "rgba(239,68,68,0.85)",
                    borderRadius: "4px 4px 0 0",
                    cursor: "grab",
                    fontSize: 9,
                    color: "#fff",
                    letterSpacing: "0.04em",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" opacity="0.7">
                    <circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/>
                    <circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/>
                  </svg>
                  drag to move
                </div>
                {/* Text input */}
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
                  onBlur={(e) => {
                    // Don't commit if we just started dragging the handle
                    if (!textDragging.current) commitText();
                    else e.target.focus();
                  }}
                  style={{
                    background: "rgba(0,0,0,0.88)",
                    border: "1px solid rgba(239,68,68,0.7)",
                    borderTop: "none",
                    color: "#ef4444",
                    fontFamily: "monospace",
                    fontSize: 14,
                    padding: "4px 8px",
                    borderRadius: "0 0 4px 4px",
                    outline: "none",
                    minWidth: 140,
                  }}
                  placeholder="type · Enter to place"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Scrub bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={togglePlay}
          title="Play / Pause (Space)"
          aria-label={isPlaying ? "Pause" : "Play"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.9)",
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 150ms",
          }}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "rgba(255,255,255,0.65)",
            minWidth: 54,
            letterSpacing: "0.02em",
          }}
        >
          {fmtTime(currentTime)}
        </span>

        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={currentTime}
          onPointerDown={() => { isDraggingRef.current = true; }}
          onPointerUp={() => { isDraggingRef.current = false; }}
          onChange={(e) => {
            const t = Number(e.target.value);
            setCurrentTime(t);
            const v = videoRef.current;
            if (v) v.currentTime = t;
          }}
          style={{ flex: 1, accentColor: "#f59e0b", cursor: "pointer" }}
        />

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            minWidth: 54,
            textAlign: "right",
            letterSpacing: "0.02em",
          }}
        >
          {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
}

const secondaryBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.65)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  cursor: "pointer",
  transition: "all 150ms",
  userSelect: "none",
};
