"use client";

import type { NavigationPoiCard } from "./navigation-pois";

type NavigationTimingSnapshot = {
  currentTimeLabel: string | null;
  minutesUntilFocus: number | null;
  minutesUntilDestination: number | null;
  routePhase: string | null;
  commentaryBucket: number;
};

export function buildNavigationTimingSnapshot(options: {
  progressPercent: number;
  poiCards: NavigationPoiCard[];
  nextPoi?: NavigationPoiCard;
  destination?: NavigationPoiCard;
}): NavigationTimingSnapshot {
  const { progressPercent, poiCards, nextPoi, destination } = options;
  const progressRatio = clamp(progressPercent / 100, 0, 1);
  const currentTimeMs = getCurrentTimeMs(poiCards, progressRatio);
  const focusPoi = nextPoi ?? destination;
  const focusEtaMs = parseRouteTime(focusPoi?.etaIso);
  const destinationEtaMs = parseRouteTime(destination?.etaIso);
  const focusProgressRatio = focusPoi?.progressRatio ?? 1;

  const minutesUntilFocus =
    currentTimeMs !== null && focusEtaMs !== null
      ? Math.max(0, Math.round((focusEtaMs - currentTimeMs) / 60_000))
      : null;
  const minutesUntilDestination =
    currentTimeMs !== null && destinationEtaMs !== null
      ? Math.max(0, Math.round((destinationEtaMs - currentTimeMs) / 60_000))
      : null;
  const distanceToFocusRatio = Math.max(0, focusProgressRatio - progressRatio);

  return {
    currentTimeLabel: formatTimeLabel(currentTimeMs),
    minutesUntilFocus,
    minutesUntilDestination,
    routePhase: getRoutePhase({
      progressRatio,
      focusProgressRatio,
      distanceToFocusRatio,
      minutesUntilFocus,
      hasUpcomingPoi: Boolean(nextPoi),
    }),
    commentaryBucket: getCommentaryBucket({
      progressPercent,
      distanceToFocusRatio,
      minutesUntilFocus,
    }),
  };
}

function getCurrentTimeMs(
  poiCards: NavigationPoiCard[],
  progressRatio: number,
): number | null {
  if (!poiCards.length) {
    return null;
  }

  if (poiCards.length === 1) {
    return parseRouteTime(poiCards[0].etaIso);
  }

  const currentIndex = poiCards.findIndex(
    (poi) => poi.progressRatio >= progressRatio - 0.0001,
  );
  const nextIndex = currentIndex < 0 ? poiCards.length - 1 : currentIndex;
  const previousIndex = Math.max(nextIndex - 1, 0);
  const previousPoi = poiCards[previousIndex];
  const nextPoi = poiCards[nextIndex];
  const previousTimeMs = parseRouteTime(previousPoi.etaIso);
  const nextTimeMs = parseRouteTime(nextPoi.etaIso);

  if (previousTimeMs === null && nextTimeMs === null) {
    return null;
  }
  if (previousTimeMs === null) {
    return nextTimeMs;
  }
  if (nextTimeMs === null) {
    return previousTimeMs;
  }
  if (previousIndex === nextIndex) {
    return nextTimeMs;
  }

  const segmentStart = previousPoi.progressRatio;
  const segmentEnd = nextPoi.progressRatio;
  if (segmentEnd <= segmentStart) {
    return nextTimeMs;
  }

  const segmentProgress = clamp(
    (progressRatio - segmentStart) / (segmentEnd - segmentStart),
    0,
    1,
  );

  return Math.round(
    previousTimeMs + (nextTimeMs - previousTimeMs) * segmentProgress,
  );
}

function getRoutePhase(options: {
  progressRatio: number;
  focusProgressRatio: number;
  distanceToFocusRatio: number;
  minutesUntilFocus: number | null;
  hasUpcomingPoi: boolean;
}): string | null {
  const {
    progressRatio,
    focusProgressRatio,
    distanceToFocusRatio,
    minutesUntilFocus,
    hasUpcomingPoi,
  } = options;

  if (!hasUpcomingPoi) {
    if (progressRatio >= 0.96 || distanceToFocusRatio <= 0.01) {
      return "arrival window";
    }
    return "final approach";
  }
  if ((minutesUntilFocus ?? 999) <= 4 || distanceToFocusRatio <= 0.015) {
    return "approaching";
  }

  const segmentWindow = Math.max(focusProgressRatio - progressRatio, 0.0001);
  if (segmentWindow >= 0.08) {
    return "en route";
  }
  return "setting off";
}

function getCommentaryBucket(options: {
  progressPercent: number;
  distanceToFocusRatio: number;
  minutesUntilFocus: number | null;
}): number {
  const { progressPercent, distanceToFocusRatio, minutesUntilFocus } = options;

  if ((minutesUntilFocus ?? 999) <= 4 || distanceToFocusRatio <= 0.015) {
    return 100 + Math.floor(progressPercent / 4);
  }

  return Math.floor(progressPercent / 8);
}

function parseRouteTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime();
}

function formatTimeLabel(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
