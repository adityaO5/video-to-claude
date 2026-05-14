"use client";

import React, { forwardRef, useRef, useState, useCallback } from "react";

interface ProbeResult {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
}

interface VideoViewerProps {
  projectId: string;
  probe: ProbeResult;
  onTimeUpdate: (t: number) => void;
  onPlayPauseChange: (playing: boolean) => void;
}

function formatTime(s: number): string {
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = seconds.toFixed(1).padStart(4, "0");
  return `${mm}:${ss}`;
}

// ── Transport bar ────────────────────────────────────────────────────────────

interface TransportProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
}

const btnBase: React.CSSProperties = {
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "#e8e8ea",
  fontSize: 14,
  padding: 0,
  borderRadius: 4,
  flexShrink: 0,
};

function TransportBar({
  videoRef,
  duration,
  currentTime,
  isPlaying,
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
}: TransportProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const btnStyle = (id: string): React.CSSProperties => ({
    ...btnBase,
    color: hovered === id ? "#f59e0b" : "#e8e8ea",
  });

  const seek = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + delta));
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
  };

  const skipToStart = () => {
    const v = videoRef.current;
    if (v) v.currentTime = 0;
  };

  const skipToEnd = () => {
    const v = videoRef.current;
    if (v) v.currentTime = duration;
  };

  const requestFullscreen = () => {
    videoRef.current?.requestFullscreen();
  };

  return (
    <div
      style={{
        height: 48,
        background: "#0d0d0f",
        borderTop: "1px solid #2a2a2e",
        padding: "0 12px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}
    >
      {/* Skip to start */}
      <button
        style={btnStyle("start")}
        onMouseEnter={() => setHovered("start")}
        onMouseLeave={() => setHovered(null)}
        onClick={skipToStart}
        title="Skip to start"
      >
        ⏮
      </button>

      {/* Back 5s */}
      <button
        style={btnStyle("back")}
        onMouseEnter={() => setHovered("back")}
        onMouseLeave={() => setHovered(null)}
        onClick={() => seek(-5)}
        title="Back 5s"
      >
        ⏪
      </button>

      {/* Play/Pause */}
      <button
        style={btnStyle("play")}
        onMouseEnter={() => setHovered("play")}
        onMouseLeave={() => setHovered(null)}
        onClick={togglePlay}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      {/* Forward 5s */}
      <button
        style={btnStyle("fwd")}
        onMouseEnter={() => setHovered("fwd")}
        onMouseLeave={() => setHovered(null)}
        onClick={() => seek(5)}
        title="Forward 5s"
      >
        ⏩
      </button>

      {/* Skip to end */}
      <button
        style={btnStyle("end")}
        onMouseEnter={() => setHovered("end")}
        onMouseLeave={() => setHovered(null)}
        onClick={skipToEnd}
        title="Skip to end"
      >
        ⏭
      </button>

      {/* Time display */}
      <span
        style={{
          fontFamily: "var(--font-mono), 'Azeret Mono', monospace",
          fontSize: 12,
          marginLeft: 4,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "#f59e0b" }}>{formatTime(currentTime)}</span>
        <span style={{ color: "#666670" }}> / {formatTime(duration)}</span>
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Volume / mute */}
      <button
        style={btnStyle("mute")}
        onMouseEnter={() => setHovered("mute")}
        onMouseLeave={() => setHovered(null)}
        onClick={onMuteToggle}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={isMuted ? 0 : volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        style={{ width: 60, accentColor: "#f59e0b", cursor: "pointer" }}
        title="Volume"
      />

      {/* Fullscreen */}
      <button
        style={btnStyle("fs")}
        onMouseEnter={() => setHovered("fs")}
        onMouseLeave={() => setHovered(null)}
        onClick={requestFullscreen}
        title="Fullscreen"
      >
        ⛶
      </button>
    </div>
  );
}

// ── VideoViewer ──────────────────────────────────────────────────────────────

const VideoViewer = forwardRef<HTMLVideoElement, VideoViewerProps>(
  ({ projectId, probe, onTimeUpdate, onPlayPauseChange }, ref) => {
    const internalRef = useRef<HTMLVideoElement>(null);

    // Resolve the forwarded ref: if the caller passed a ref use it; otherwise
    // fall back to our internal one so the transport bar always has access.
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) ?? internalRef;

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(probe.duration ?? 0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);

    const handleTimeUpdate = useCallback(() => {
      const t = videoRef.current?.currentTime ?? 0;
      setCurrentTime(t);
      onTimeUpdate(t);
    }, [videoRef, onTimeUpdate]);

    const handlePlay = useCallback(() => {
      setIsPlaying(true);
      onPlayPauseChange(true);
    }, [onPlayPauseChange]);

    const handlePause = useCallback(() => {
      setIsPlaying(false);
      onPlayPauseChange(false);
    }, [onPlayPauseChange]);

    const handleLoadedMetadata = useCallback(() => {
      const d = videoRef.current?.duration ?? probe.duration;
      setDuration(d);
    }, [videoRef, probe.duration]);

    const handleVolumeChange = useCallback(
      (v: number) => {
        setVolume(v);
        setIsMuted(v === 0);
        if (videoRef.current) {
          videoRef.current.volume = v;
          videoRef.current.muted = v === 0;
        }
      },
      [videoRef]
    );

    const handleMuteToggle = useCallback(() => {
      setIsMuted((prev) => {
        const next = !prev;
        if (videoRef.current) {
          videoRef.current.muted = next;
        }
        return next;
      });
    }, [videoRef]);

    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {/* Video container — flex:1 so it fills panel height; object-fit:contain handles any aspect ratio */}
        <div
          style={{
            position: "relative",
            background: "#000",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <video
            ref={ref ?? internalRef}
            src={`/api/projects/${projectId}/video`}
            preload="metadata"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>

        {/* Transport bar */}
        <TransportBar
          videoRef={videoRef}
          duration={duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
        />
      </div>
    );
  }
);

VideoViewer.displayName = "VideoViewer";

export default VideoViewer;
