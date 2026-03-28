"use client";

import {
  HeadphonesIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DemoNavigationState } from "@/lib/navigation/use-demo-navigation";
import type { NavigationPoiCard } from "@/lib/navigation/navigation-pois";
import type { TourModeState } from "@/lib/navigation/use-tour-mode";
import {
  type PoiSlideshowImage,
  usePoiSlideshows,
} from "@/lib/navigation/use-poi-slideshows";

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
    tour.audio.transcript.trim() || navigation.commentary.text.trim();
  const mediaPois = useMemo(
    () =>
      [
        storyPoi,
        ...navigation.upcomingPois.filter((poi) => poi.id !== storyPoi.id),
      ].slice(0, 3),
    [navigation.upcomingPois, storyPoi],
  );
  const slideshows = usePoiSlideshows({
    city: navigation.city,
    pois: mediaPois,
    enabled: navigation.enabled,
  });
  const storySlides =
    slideshows[storyPoi.id] ?? buildFallbackSlides(storyPoi);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    setSlideIndex(0);
  }, [storyPoi.id]);

  useEffect(() => {
    if (!navigation.isAutoPlaying || storySlides.length < 2) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % storySlides.length);
    }, 3_200);

    return () => window.clearInterval(intervalId);
  }, [navigation.isAutoPlaying, storySlides.length, storyPoi.id]);

  const heroSlide =
    storySlides[slideIndex % Math.max(storySlides.length, 1)] ??
    buildFallbackSlides(storyPoi)[0];

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
              onClick={
                navigation.isAutoPlaying
                  ? navigation.stopAutoPlay
                  : navigation.startAutoPlay
              }
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/72 transition hover:bg-white/10"
            >
              <span className="inline-flex items-center gap-1.5">
                {navigation.isAutoPlaying ? (
                  <PauseIcon className="size-3.5" />
                ) : (
                  <PlayIcon className="size-3.5" />
                )}
                {navigation.isAutoPlaying ? "Pause" : "Play"}
              </span>
            </button>
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

        <div className="relative h-[320px] overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03]">
          {heroSlide?.url ? (
            <img
              key={heroSlide.id}
              src={heroSlide.url}
              alt={heroSlide.alt}
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-white/[0.04] text-[13px] font-medium text-white/40">
              Route photo
            </div>
          )}
          <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
            {storySlides.length > 0
              ? `${Math.min(slideIndex + 1, storySlides.length)} / ${storySlides.length}`
              : "Tour"}
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(5,8,12,0.92))] px-4 pb-4 pt-10">
            <h3 className="text-[22px] font-semibold tracking-tight text-white">
              {storyPoi.title}
            </h3>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/62">
                {storyPoi.placeName}
              </p>
              {heroSlide?.sourceLabel ? (
                <p className="truncate text-[10px] uppercase tracking-[0.18em] text-white/48">
                  {heroSlide.sourceLabel}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/54">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            {describeAudioStatus(tour)}
          </span>
          {navigation.currentTimeLabel ? (
            <span className="rounded-full border border-cyan-300/14 bg-cyan-300/[0.08] px-2.5 py-1 text-cyan-100/78">
              Route time {navigation.currentTimeLabel}
            </span>
          ) : null}
          {navigation.minutesUntilFocus !== null ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {navigation.minutesUntilFocus} min to {storyPoi.title}
            </span>
          ) : null}
          {navigation.routePhase ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 capitalize">
              {navigation.routePhase}
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            {tour.audio.usedLiveAudio ? "Gemini Live audio" : "Waiting on audio"}
          </span>
        </div>

        <p className="mt-3 text-[14px] leading-6 text-white/84">
          {displayedCommentary || "Tuning the next tour beat..."}
        </p>
        {navigation.commentary.status === "loading" ? (
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-cyan-200/62">
            Updating the next beat
          </p>
        ) : null}

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
            <span>{navigation.currentTimeLabel ?? "Route start"}</span>
            <span>{storyPoi.etaLabel ?? "Destination"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function buildFallbackSlides(
  poi: NavigationPoiCard | undefined,
) {
  if (!poi?.imageUrl) {
    return [] as PoiSlideshowImage[];
  }

  return [
    {
      id: `upload:${poi.id}`,
      url: poi.imageUrl,
      alt: poi.title,
      source: "upload" as const,
      sourceLabel: "Uploads",
    },
  ];
}
