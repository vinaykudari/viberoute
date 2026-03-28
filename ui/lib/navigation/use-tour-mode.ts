"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoNavigationState } from "./use-demo-navigation";
import { useTourAudio } from "./use-tour-audio";

export type TourModeState = ReturnType<typeof useTourMode>;

export function useTourMode(navigation: DemoNavigationState) {
  const [isOpen, setIsOpen] = useState(false);

  const activePoi = useMemo(
    () => navigation.nextPoi ?? navigation.destination,
    [navigation.destination, navigation.nextPoi],
  );

  useEffect(() => {
    if (!navigation.enabled) {
      setIsOpen(false);
    }
  }, [navigation.enabled]);

  const audio = useTourAudio({
    enabled: isOpen && navigation.enabled,
    text:
      navigation.commentary.status === "ready" ? navigation.commentary.text : "",
    utteranceKey: isOpen && activePoi ? activePoi.id : null,
  });

  return {
    isOpen,
    activePoi,
    audio,
    open: () => {
      setIsOpen(true);
      if (!navigation.commentary.text.trim()) {
        navigation.refreshCommentary();
      }
    },
    close: () => {
      audio.stop();
      setIsOpen(false);
    },
  };
}
