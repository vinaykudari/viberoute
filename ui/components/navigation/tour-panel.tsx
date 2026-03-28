"use client";

import {
  HeadphonesIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import type { DemoNavigationState } from "@/lib/navigation/use-demo-navigation";
import type { TourModeState } from "@/lib/navigation/use-tour-mode";

function describeAudioStatus(tour: TourModeState): string {
  if (tour.audio.status === "connecting") {
    return "Connecting to Gemini Live";
  }
  if (tour.audio.status === "streaming") {
    return "Streaming live audio";
  }
  if (tour.audio.status === "muted") {
    return "Muted";
  }
  if (tour.audio.status === "unsupported") {
    return "Audio unavailable";
  }
  if (tour.audio.status === "error") {
    return "Audio retry needed";
  }
  return tour.audio.voiceLabel ? `Live voice: ${tour.audio.voiceLabel}` : "Audio ready";
}

export function TourPanel({
  navigation,
  tour,
}: {
  navigation: DemoNavigationState;
  tour: TourModeState;
}) {
  if (!navigation.enabled || !navigation.destination || !tour.isOpen || !tour.activePoi) {
    return null;
  }

  const storyPoi = tour.activePoi;
  const displayedCommentary =
    tour.audio.transcript.trim() || navigation.commentary.text;
  const imageTrail = [
    storyPoi,
    ...navigation.upcomingPois.filter((poi) => poi.id !== storyPoi.id),
  ].slice(0, 3);

  return (
    <div className="pointer-events-none absolute inset-y-5 right-5 z-30 flex w-[min(420px,calc(100%-2.5rem))] flex-col justify-end gap-3">
      <section className="pointer-events-auto rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,20,0.96),rgba(8,10,16,0.92))] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/72">
              <HeadphonesIcon className="size-3.5" />
              Tour
            </div>
            <p className="mt-1 truncate text-[13px] text-white/70">
              {storyPoi.placeName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={tour.audio.toggleMuted}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/72 transition hover:bg-white/10"
            >
              <span className="inline-flex items-center gap-1.5">
                {tour.audio.isMuted ? (
                  <VolumeXIcon className="size-3.5" />
                ) : (
                  <Volume2Icon className="size-3.5" />
                )}
                {tour.audio.isMuted ? "Unmute" : "Mute"}
              </span>
            </button>
            <button
              type="button"
              onClick={tour.close}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/72 transition hover:bg-white/10"
              aria-label="Close tour"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid h-[320px] grid-cols-[1.9fr,1fr] gap-2 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03]">
          <div className="relative overflow-hidden rounded-[20px]">
            {imageTrail[0]?.imageUrl ? (
              <img
                src={imageTrail[0].imageUrl}
                alt={imageTrail[0].title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-white/[0.04] text-[13px] font-medium text-white/40">
                Route photo
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(5,8,12,0.92))] px-4 pb-4 pt-10">
              <h3 className="text-[22px] font-semibold tracking-tight text-white">
                {storyPoi.title}
              </h3>
              <p className="mt-1 text-[12px] uppercase tracking-[0.16em] text-white/62">
                {storyPoi.placeName}
              </p>
            </div>
          </div>
          <div className="grid grid-rows-2 gap-2">
            {imageTrail.slice(1).map((poi) => (
              <div
                key={poi.id}
                className="relative overflow-hidden rounded-[18px] border border-white/8"
              >
                {poi.imageUrl ? (
                  <img
                    src={poi.imageUrl}
                    alt={poi.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-white/[0.04] text-[12px] text-white/34">
                    Next stop
                  </div>
                )}
              </div>
            ))}
            {imageTrail.length === 1 ? (
              <div className="rounded-[18px] border border-dashed border-white/8 bg-white/[0.02]" />
            ) : null}
            {imageTrail.length === 2 ? (
              <div className="rounded-[18px] border border-dashed border-white/8 bg-white/[0.02]" />
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px] text-white/54">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            {describeAudioStatus(tour)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            {tour.audio.usedLiveAudio ? "Gemini Live audio" : "Waiting on audio"}
          </span>
        </div>

        <p className="mt-3 text-[14px] leading-6 text-white/84">
          {navigation.commentary.status === "loading"
            ? "Lining up the next tour beat..."
            : displayedCommentary}
        </p>

        {tour.audio.error ? (
          <p className="mt-2 text-[11px] text-amber-200/78">{tour.audio.error}</p>
        ) : null}
        {navigation.commentary.error ? (
          <p className="mt-2 text-[11px] text-amber-200/78">{navigation.commentary.error}</p>
        ) : null}

        <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-white/55">
            <span>Demo GPS progress</span>
            <span>{Math.round(navigation.progressPercent)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={navigation.progressPercent}
            onChange={(event) =>
              navigation.setProgressPercent(Number(event.target.value))
            }
            className="h-2 w-full cursor-pointer accent-cyan-400"
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-white/35">
            <span>Route start</span>
            <span>Destination</span>
          </div>
        </div>
      </section>
    </div>
  );
}
