"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import SceneList from "@/components/SceneList";
import ExtractPanel from "@/components/ExtractPanel";
import FrameStrip from "@/components/FrameStrip";
import SnippetCopy from "@/components/SnippetCopy";
import type { ProjectManifest } from "@/lib/manifest";
import type { Scene } from "@/lib/scenedetect";
import type { RefinedScene } from "@/components/SceneList";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InspectorProps {
  projectId: string;
  status: string;
  scenes: Scene[];
  refined: boolean;
  manifest?: ProjectManifest | null;
  onRefine: (scenes: RefinedScene[]) => void;
  currentTime: number;
  onSeek: (t: number) => void;
}

// ── Awaiting-Refinement tabs ──────────────────────────────────────────────────

function RefinementTabs({
  projectId,
  scenes,
  refined,
  onRefine,
  onSeek,
}: {
  projectId: string;
  scenes: Scene[];
  refined: boolean;
  onRefine: (scenes: RefinedScene[]) => void;
  onSeek: (t: number) => void;
}) {
  return (
    <Tabs
      defaultValue="scenes"
      className="flex flex-col"
      style={{ height: "100%" }}
    >
      {/* Tab bar */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <TabsList
          className="w-full rounded-none h-9 p-0"
          style={{ background: "var(--surface)", gap: 0 }}
        >
          <TabsTrigger
            value="scenes"
            className="flex-1 rounded-none h-9 text-xs font-medium tracking-wide uppercase border-0 border-b-2 border-transparent data-active:border-b-amber-400 data-active:text-amber-400"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Scenes
          </TabsTrigger>
          <TabsTrigger
            value="extract"
            className="flex-1 rounded-none h-9 text-xs font-medium tracking-wide uppercase border-0 border-b-2 border-transparent data-active:border-b-amber-400 data-active:text-amber-400"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Extract
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Scenes tab */}
      <TabsContent value="scenes" className="flex-1 min-h-0 m-0">
        <ScrollArea className="h-full">
          <div className="p-3 flex flex-col gap-3">
            <p
              className="text-xs"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              Detected scenes — click to seek
            </p>
            <SceneList
              projectId={projectId}
              scenes={scenes}
              refined={refined}
              onRefine={onRefine}
              // onSeek will be wired in Task 19; passed through for forward compat
              {...({ onSeek } as object)}
            />
          </div>
        </ScrollArea>
      </TabsContent>

      {/* Extract tab */}
      <TabsContent value="extract" className="flex-1 min-h-0 m-0">
        <ScrollArea className="h-full">
          <div className="p-3">
            <ExtractPanel
              projectId={projectId}
              scenes={scenes}
              onExtractStart={() => {}}
            />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

// ── Done / manifest tabs ──────────────────────────────────────────────────────

function DoneTabs({
  projectId,
  manifest,
  onSeek,
}: {
  projectId: string;
  manifest: ProjectManifest | null | undefined;
  onSeek: (t: number) => void;
}) {
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(
    () => new Set(manifest?.scenes.map((s) => s.id) ?? [])
  );

  function toggleScene(id: number) {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Tabs
      defaultValue="frames"
      className="flex flex-col"
      style={{ height: "100%" }}
    >
      {/* Tab bar */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <TabsList
          className="w-full rounded-none h-9 p-0"
          style={{ background: "var(--surface)", gap: 0 }}
        >
          <TabsTrigger
            value="frames"
            className="flex-1 rounded-none h-9 text-xs font-medium tracking-wide uppercase border-0 border-b-2 border-transparent data-active:border-b-amber-400 data-active:text-amber-400"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Frames
          </TabsTrigger>
          <TabsTrigger
            value="snippets"
            className="flex-1 rounded-none h-9 text-xs font-medium tracking-wide uppercase border-0 border-b-2 border-transparent data-active:border-b-amber-400 data-active:text-amber-400"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Snippets
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Frames tab */}
      <TabsContent value="frames" className="flex-1 min-h-0 m-0">
        <ScrollArea className="h-full">
          <div className="p-3 flex flex-col gap-4">
            {!manifest ? (
              <p
                className="text-xs text-center py-6"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                No frames extracted yet.
              </p>
            ) : (
              manifest.scenes.map((scene) => (
                <div key={scene.id}>
                  {/* Scene header — collapsible */}
                  <button
                    onClick={() => toggleScene(scene.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors duration-150"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "rgba(245,158,11,0.35)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--border)";
                    }}
                  >
                    <span>
                      Scene {scene.id}
                      {scene.label ? ` · ${scene.label}` : ""}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {scene.start.toFixed(1)}s–{scene.end.toFixed(1)}s
                      <span className="ml-2">{expandedScenes.has(scene.id) ? "▾" : "▸"}</span>
                    </span>
                  </button>

                  {/* Segments */}
                  {expandedScenes.has(scene.id) && (
                    <div className="mt-2 flex flex-col gap-3 pl-2">
                      {scene.segments.map((seg) => (
                        <div key={seg.id}>
                          <p
                            className="text-xs mb-1.5"
                            style={{
                              color: "var(--text-muted)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            Segment {seg.id}
                          </p>
                          <FrameStrip
                            projectId={projectId}
                            sceneId={scene.id}
                            segId={seg.id}
                            frames={seg.frames}
                            // onSeek will be wired in Task 19; passed through for forward compat
                            {...({ onSeek } as object)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      {/* Snippets tab */}
      <TabsContent value="snippets" className="flex-1 min-h-0 m-0">
        <ScrollArea className="h-full">
          <div className="p-3 flex flex-col gap-3">
            {/* Global snippet */}
            <SnippetCopy projectId={projectId} label="All scenes" />

            {/* Per-scene snippets */}
            {manifest?.scenes.map((scene) => (
              <SnippetCopy
                key={scene.id}
                projectId={projectId}
                sceneId={scene.id}
                label={"Scene " + scene.id}
              />
            ))}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

// ── Inspector ─────────────────────────────────────────────────────────────────

export default function Inspector({
  projectId,
  status,
  scenes,
  refined,
  manifest,
  onRefine,
  currentTime: _currentTime,
  onSeek,
}: InspectorProps) {
  const isDone = status === "done";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      {isDone ? (
        <DoneTabs projectId={projectId} manifest={manifest} onSeek={onSeek} />
      ) : (
        <RefinementTabs
          projectId={projectId}
          scenes={scenes}
          refined={refined}
          onRefine={onRefine}
          onSeek={onSeek}
        />
      )}
    </div>
  );
}
