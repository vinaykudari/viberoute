"use client";

import type { PlannerChatImage } from "@viberoute/shared";
import { Thread } from "./assistant-ui/thread";

export function ChatPanel({
  images,
}: Readonly<{
  images: PlannerChatImage[];
}>) {
  return (
    <aside className="flex h-[calc(100vh-2rem)] flex-col rounded-2xl border border-white/[0.06] bg-[#101116] shadow-2xl shadow-black/40">
      <div className="flex-1 overflow-hidden">
        <Thread images={images} />
      </div>
    </aside>
  );
}
