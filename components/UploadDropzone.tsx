"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface UploadDropzoneProps {
  onUploading?: () => void;
}

type DropzoneState = "idle" | "dragover" | "selected" | "uploading" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadDropzone({ onUploading }: UploadDropzoneProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<DropzoneState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");

  const acceptFile = useCallback((f: File) => {
    if (!f.type.startsWith("video/")) {
      setError("Please select a video file.");
      setState("error");
      return;
    }
    setFile(f);
    setError("");
    setState("selected");
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState("dragover");
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => (prev === "dragover" ? "idle" : prev));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dropped = e.dataTransfer.files[0];
      if (dropped) acceptFile(dropped);
      else setState("idle");
    },
    [acceptFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (picked) acceptFile(picked);
    },
    [acceptFile]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setState("uploading");
    onUploading?.();

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { projectId: string };
      router.push(`/projects/${data.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }, [file, onUploading, router]);

  const handleZoneClick = () => {
    if (state === "idle" || state === "error") {
      inputRef.current?.click();
    }
  };

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setError("");
    setState("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const isDragover = state === "dragover";
  const isSelected = state === "selected";
  const isUploading = state === "uploading";
  const isError = state === "error";

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload video"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleZoneClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleZoneClick();
        }}
        className="relative w-full cursor-pointer select-none overflow-hidden rounded-lg transition-all duration-200"
        style={{
          background: isDragover
            ? "rgba(245,158,11,0.06)"
            : isSelected
              ? "rgba(245,158,11,0.03)"
              : "rgba(26,26,30,0.7)",
          border: `1.5px dashed ${
            isDragover
              ? "#f59e0b"
              : isSelected
                ? "rgba(245,158,11,0.5)"
                : isError
                  ? "#ef4444"
                  : "#3a3a3e"
          }`,
          boxShadow: isDragover
            ? "0 0 0 3px rgba(245,158,11,0.15), inset 0 0 60px rgba(245,158,11,0.04)"
            : "none",
          minHeight: "220px",
        }}
      >
        <div className="flex flex-col items-center justify-center gap-4 px-8 py-12 text-center">
          {isUploading ? (
            <>
              {/* Uploading state */}
              <div
                className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "rgba(245,158,11,0.3)", borderTopColor: "#f59e0b" }}
              />
              <div className="flex flex-col items-center gap-1">
                <span
                  className="text-sm tracking-widest uppercase"
                  style={{ color: "#f59e0b", fontFamily: "var(--font-mono)" }}
                >
                  Uploading
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {file?.name}
                </span>
              </div>
            </>
          ) : isSelected && file ? (
            <>
              {/* Selected state */}
              <div
                className="flex items-center justify-center w-12 h-12 rounded-lg"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}
              >
                <FilmIcon />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span
                  className="text-sm font-medium max-w-xs truncate"
                  style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                  title={file.name}
                >
                  {file.name}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {formatBytes(file.size)}
                </span>
              </div>
              <button
                onClick={reset}
                className="text-xs underline underline-offset-2 transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                change file
              </button>
            </>
          ) : (
            <>
              {/* Idle / dragover / error state */}
              <div
                className="flex items-center justify-center w-14 h-14 rounded-xl transition-all duration-200"
                style={{
                  background: isDragover
                    ? "rgba(245,158,11,0.15)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isDragover ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
                }}
              >
                <UploadIcon isDragover={isDragover} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span
                  className="text-base font-medium transition-colors duration-200"
                  style={{
                    color: isDragover ? "#f59e0b" : "var(--text)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {isDragover ? "Release to upload" : "Drop your video here"}
                </span>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  or{" "}
                  <span
                    className="underline underline-offset-2 cursor-pointer transition-colors"
                    style={{ color: "#f59e0b" }}
                  >
                    browse files
                  </span>
                </span>
                <span
                  className="text-xs mt-1"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  MP4 · MOV · MKV · WebM · AVI
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {isError && error && (
        <div
          className="w-full flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span className="shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Upload button */}
      {isSelected && file && (
        <button
          onClick={handleUpload}
          className="w-full h-11 rounded-lg text-sm font-semibold tracking-wide transition-all duration-150 active:scale-[0.99]"
          style={{
            background: "#f59e0b",
            color: "#0d0d0f",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#fbbf24";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#f59e0b";
          }}
        >
          Upload &amp; Process
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleInputChange}
        aria-hidden="true"
      />
    </div>
  );
}

function UploadIcon({ isDragover }: { isDragover: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={isDragover ? "#f59e0b" : "#666670"}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f59e0b"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
      <line x1="17" y1="17" x2="22" y2="17" />
    </svg>
  );
}
