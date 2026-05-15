export type AnnotationTool = "arrow" | "rect" | "text" | "freehand";

export interface ArrowShape {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RectShape {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextShape {
  type: "text";
  x: number;
  y: number;
  value: string;
}

export interface FreehandShape {
  type: "freehand";
  points: Array<{ x: number; y: number }>;
}

export type Shape = ArrowShape | RectShape | TextShape | FreehandShape;

export function buildAnnotationSvg(
  nativeW: number,
  nativeH: number,
  shapes: Shape[],
  displayW: number,
  displayH: number
): string {
  const scaleX = nativeW / displayW;
  const scaleY = nativeH / displayH;
  const scale = Math.max(scaleX, scaleY);

  const COLOR = "#ef4444";
  const STROKE = Math.max(2, Math.round(nativeW / 480));
  const FONT_SIZE = Math.max(16, Math.round(nativeW / 50));

  const defs = `<defs>
    <marker id="ah" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
      <polygon points="0 0, 10 4, 0 8" fill="${COLOR}" />
    </marker>
  </defs>`;

  function sx(x: number) { return Math.round(x * scaleX); }
  function sy(y: number) { return Math.round(y * scaleY); }

  const elements = shapes
    .map((s): string => {
      if (s.type === "arrow") {
        return `<line x1="${sx(s.x1)}" y1="${sy(s.y1)}" x2="${sx(s.x2)}" y2="${sy(s.y2)}"
          stroke="${COLOR}" stroke-width="${STROKE}" marker-end="url(#ah)"
          stroke-linecap="round" />`;
      }
      if (s.type === "rect") {
        return `<rect x="${sx(s.x)}" y="${sy(s.y)}" width="${sx(s.w)}" height="${sy(s.h)}"
          stroke="${COLOR}" stroke-width="${STROKE}" fill="rgba(239,68,68,0.08)"
          rx="3" ry="3" />`;
      }
      if (s.type === "text") {
        const escaped = s.value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<text x="${sx(s.x)}" y="${sy(s.y)}"
          font-family="monospace" font-size="${Math.round(FONT_SIZE)}px" font-weight="bold"
          fill="${COLOR}" stroke="#000" stroke-width="${Math.round(STROKE * 0.7)}"
          paint-order="stroke">${escaped}</text>`;
      }
      if (s.type === "freehand" && s.points.length > 1) {
        const pts = s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
        return `<polyline points="${pts}"
          stroke="${COLOR}" stroke-width="${STROKE}" fill="none"
          stroke-linecap="round" stroke-linejoin="round" />`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n  ");

  // Unused scale warning suppression
  void scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${nativeW}" height="${nativeH}">
  ${defs}
  ${elements}
</svg>`;
}
