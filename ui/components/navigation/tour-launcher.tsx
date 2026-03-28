"use client";

import { HeadphonesIcon } from "lucide-react";

export function TourLauncher({
  onStart,
}: {
  onStart: () => void;
}) {
  return (
    <div className="pointer-events-none absolute bottom-5 right-5 z-30 flex justify-end">
      <button
        type="button"
        onClick={onStart}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,18,30,0.95),rgba(14,12,24,0.88))] px-3 py-2 text-left shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-200/35 hover:bg-[linear-gradient(135deg,rgba(12,26,44,0.98),rgba(18,15,32,0.92))]"
        aria-label="Start tour"
      >
        <span className="flex size-8 items-center justify-center rounded-full border border-white/12 bg-cyan-300/12 text-cyan-100">
          <HeadphonesIcon className="size-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/82">
          Tour
        </span>
      </button>
    </div>
  );
}
