"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoNavigationState } from "./use-demo-navigation";
import { useTourAudio } from "./use-tour-audio";

export type TourModeState = ReturnType<typeof useTourMode>;

export function useTourMode(navigation: DemoNavigationState) {
  const [isOpen, setIsOpen] = useState(false);

  const activePoi = useMemo(
    () =>
      navigation.upcomingPois.find(
        (poi) => poi.id === navigation.commentary.focusPoiId,
      ) ??
      navigation.nextPoi ??
      navigation.destination,
    [
      navigation.commentary.focusPoiId,
      navigation.destination,
      navigation.nextPoi,
      navigation.upcomingPois,
    ],
  );

  useEffect(() => {
    if (!navigation.enabled) {
      setIsOpen(false);
    }
  }, [navigation.enabled]);

  const audio = useTourAudio({
    enabled: isOpen && navigation.enabled,
    text: navigation.commentary.text,
    utteranceKey:
      isOpen && activePoi
        ? navigation.commentary.beatKey ?? activePoi.id
        : null,
  });

  return {
    isOpen,
    activePoi,
    audio,
    open: () => {
      audio.prime();
      setIsOpen(true);
      navigation.refreshCommentary();
      navigation.startAutoPlay();
    },
    close: () => {
      audio.stop();
      navigation.stopAutoPlay();
      setIsOpen(false);
    },
  };
}
