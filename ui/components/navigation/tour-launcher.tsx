"use client";

import { HeadphonesIcon, SparklesIcon } from "lucide-react";

export function TourLauncher({
  destinationTitle,
  onStart,
}: {
  destinationTitle: string;
  onStart: () => void;
}) {
  return (
    <div className="pointer-events-none absolute bottom-5 right-5 z-30 flex max-w-[min(360px,calc(100%-2.5rem))] justify-end">
      <button
        type="button"
        onClick={onStart}
        className="pointer-events-auto group flex items-center gap-3 rounded-full border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,18,30,0.95),rgba(14,12,24,0.88))] px-4 py-3 text-left shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-200/35 hover:bg-[linear-gradient(135deg,rgba(12,26,44,0.98),rgba(18,15,32,0.92))]"
      >
        <span className="flex size-11 items-center justify-center rounded-full border border-white/12 bg-cyan-300/12 text-cyan-100">
          <HeadphonesIcon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/72">
            <SparklesIcon className="size-3.5" />
            Tour
          </span>
          <span className="mt-1 block text-[14px] font-semibold tracking-tight text-white/92">
            Start the story for {destinationTitle}
          </span>
          <span className="mt-1 block text-[12px] leading-5 text-white/58">
            Open the narrated route with live images, spoken commentary, and the demo GPS slider.
          </span>
        </span>
      </button>
    </div>
  );
}
