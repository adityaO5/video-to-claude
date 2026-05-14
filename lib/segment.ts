export interface FrameMeta {
  idx: number;
  path: string;       // absolute path to webp
  t: number;          // seconds from video start
  width: number;
  height: number;
  bytes: number;
}

export function chunkFrames(frames: FrameMeta[], maxPerSeg = 25): FrameMeta[][] {
  const chunks: FrameMeta[][] = [];
  for (let i = 0; i < frames.length; i += maxPerSeg) {
    chunks.push(frames.slice(i, i + maxPerSeg));
  }
  return chunks;
}
