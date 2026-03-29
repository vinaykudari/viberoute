"use client";

import type {
  DayPlan,
  MapHighlightCard,
  PlannerChatImage,
  SceneIntent,
  WeatherSnapshot,
} from "@viberoute/shared";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import {
  buildNavigationPoiCards,
  type NavigationPoiCard,
} from "./navigation-pois";
import {
  buildRouteSimulation,
  getSegmentAtProgress,
  sampleRoutePosition,
} from "./route-progress";
import { buildNavigationTimingSnapshot } from "./navigation-timing";

const DEMO_AUTOPLAY_DURATION_MS = 90_000;

type CommentaryState = {
  beatKey: string | null;
  focusPoiId: string | null;
  text: string;
  focus: "poi" | "destination" | null;
  model: string | null;
  usedLive: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

export type DemoNavigationState = {
  city: string | null;
  enabled: boolean;
  progressPercent: number;
  setProgressPercent: (value: number) => void;
  isAutoPlaying: boolean;
  startAutoPlay: () => void;
  stopAutoPlay: () => void;
  currentPosition?: { lat: number; lng: number };
  nextPoi?: NavigationPoiCard;
  destination?: NavigationPoiCard;
  upcomingPois: NavigationPoiCard[];
  currentTimeLabel: string | null;
  minutesUntilFocus: number | null;
  minutesUntilDestination: number | null;
  routePhase: string | null;
  commentary: CommentaryState;
  refreshCommentary: () => void;
};

const INITIAL_COMMENTARY: CommentaryState = {
  beatKey: null,
  focusPoiId: null,
  text: "",
  focus: null,
  model: null,
  usedLive: false,
  status: "idle",
  error: null,
};

export function useDemoNavigation(options: {
  plan?: DayPlan;
  images: PlannerChatImage[];
  scenes: SceneIntent[];
  mapHighlights: MapHighlightCard[];
  weather?: WeatherSnapshot | null;
}): DemoNavigationState {
  const { plan, images, scenes, mapHighlights, weather } = options;
  const simulation = useMemo(() => buildRouteSimulation(plan), [plan]);

  const poiCards = useMemo(
    () =>
      buildNavigationPoiCards({
        plan,
        images,
        scenes,
        mapHighlights,
        stopProgress: simulation?.stopProgress ?? [],
      }),
    [images, mapHighlights, plan, scenes, simulation?.stopProgress],
  );

  const [progressPercent, setProgressPercent] = useState(0);
  const deferredProgressPercent = useDeferredValue(progressPercent);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [commentary, setCommentary] = useState<CommentaryState>(INITIAL_COMMENTARY);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const recentLinesRef = useRef<string[]>([]);
  const lastFocusKeyRef = useRef<string | null>(null);

  const progressRatio = progressPercent / 100;
  const deferredProgressRatio = deferredProgressPercent / 100;

  const currentPosition = useMemo(
    () => sampleRoutePosition(simulation, progressRatio),
    [progressRatio, simulation],
  );

  const destination = poiCards.at(-1);
  const openingPoi = useMemo(() => {
    if (!poiCards.length) {
      return undefined;
    }

    return deferredProgressRatio <= 0.06 ? poiCards[0] : undefined;
  }, [deferredProgressRatio, poiCards]);

  const nextPoi = useMemo(() => {
    if (!poiCards.length) {
      return undefined;
    }

    if (deferredProgressRatio <= 0.01) {
      return poiCards[0];
    }

    return poiCards.find(
      (poi) => poi.progressRatio > deferredProgressRatio + 0.01,
    );
  }, [deferredProgressRatio, poiCards]);

  const upcomingPois = useMemo(() => {
    if (!poiCards.length) {
      return [];
    }

    const startIndex = nextPoi
      ? poiCards.findIndex((poi) => poi.id === nextPoi.id)
      : Math.max(poiCards.length - 1, 0);

    return poiCards.slice(Math.max(startIndex, 0), startIndex + 3);
  }, [nextPoi, poiCards]);
  const commentaryPoi = openingPoi ?? nextPoi ?? destination;

  const activeSegment = useMemo(
    () => getSegmentAtProgress(simulation, deferredProgressRatio),
    [deferredProgressRatio, simulation],
  );
  const timingSnapshot = useMemo(
    () =>
      buildNavigationTimingSnapshot({
        progressPercent: deferredProgressPercent,
        poiCards,
        nextPoi,
        destination,
      }),
    [deferredProgressPercent, destination, nextPoi, poiCards],
  );
  const commentaryFocusKey = useMemo(() => {
    if (!plan || !destination || !commentaryPoi) {
      return null;
    }

    return [
      openingPoi
        ? `current:${openingPoi.id}`
        : nextPoi
          ? `poi:${nextPoi.id}`
          : `destination:${destination.id}`,
      `bucket:${timingSnapshot.commentaryBucket}`,
      `phase:${openingPoi ? "on-site" : timingSnapshot.routePhase ?? "steady"}`,
      `refresh:${refreshNonce}`,
    ].join(":");
  }, [
    commentaryPoi,
    destination,
    openingPoi,
    nextPoi,
    plan,
    refreshNonce,
    timingSnapshot.commentaryBucket,
    timingSnapshot.routePhase,
  ]);
  const commentaryRequest = useMemo(() => {
    if (!plan || !destination || !commentaryFocusKey) {
      return null;
    }

    const nextPoiIndex = nextPoi
      ? poiCards.findIndex((poi) => poi.id === nextPoi.id)
      : poiCards.length - 1;
    const remainingPoiCount =
      nextPoiIndex >= 0
        ? poiCards
            .slice(nextPoiIndex)
            .filter((poi) => !poi.isDestination).length
        : 0;

    return {
      focusKey: commentaryFocusKey,
      payload: {
        city: plan.city,
        routeSummary: plan.summary,
        progressPercent: deferredProgressPercent,
        travelMode: activeSegment?.mode ?? null,
        weatherSummary: weather?.summary ?? null,
        currentPoi: openingPoi
          ? {
              id: openingPoi.id,
              title: openingPoi.title,
              placeName: openingPoi.placeName,
              detail: openingPoi.detail ?? null,
              lat: openingPoi.lat,
              lng: openingPoi.lng,
              color: openingPoi.color,
              etaIso: openingPoi.etaIso ?? null,
              etaLabel: openingPoi.etaLabel ?? null,
            }
          : null,
        nextPoi: !openingPoi && nextPoi
          ? {
              id: nextPoi.id,
              title: nextPoi.title,
              placeName: nextPoi.placeName,
              detail: nextPoi.detail ?? null,
              lat: nextPoi.lat,
              lng: nextPoi.lng,
              color: nextPoi.color,
              etaIso: nextPoi.etaIso ?? null,
              etaLabel: nextPoi.etaLabel ?? null,
            }
          : null,
        destination: {
          id: destination.id,
          title: destination.title,
          placeName: destination.placeName,
          detail: destination.detail ?? null,
          lat: destination.lat,
          lng: destination.lng,
          color: destination.color,
          etaIso: destination.etaIso ?? null,
          etaLabel: destination.etaLabel ?? null,
        },
        currentTimeLabel: timingSnapshot.currentTimeLabel,
        minutesUntilFocus: timingSnapshot.minutesUntilFocus,
        minutesUntilDestination: timingSnapshot.minutesUntilDestination,
        routePhase: openingPoi ? "on site" : timingSnapshot.routePhase,
        isAtFocus: Boolean(openingPoi),
        remainingPoiCount,
        recentLines: recentLinesRef.current,
      },
      minutesUntilFocus: timingSnapshot.minutesUntilFocus,
      minutesUntilDestination: timingSnapshot.minutesUntilDestination,
    };
  }, [
    activeSegment?.mode,
    commentaryFocusKey,
    destination,
    openingPoi,
    nextPoi,
    plan,
    poiCards,
    weather?.summary,
  ]);
  const setManualProgressPercent = useCallback((value: number) => {
    setIsAutoPlaying(false);
    setProgressPercent(Math.min(100, Math.max(0, value)));
  }, []);
  const stopAutoPlay = useCallback(() => {
    setIsAutoPlaying(false);
  }, []);
  const startAutoPlay = useCallback(() => {
    if (!simulation) {
      return;
    }

    setProgressPercent((current) => (current >= 99.5 ? 0 : current));
    setIsAutoPlaying(true);
  }, [simulation]);

  useEffect(() => {
    setProgressPercent(0);
    setIsAutoPlaying(false);
    setCommentary(INITIAL_COMMENTARY);
    setRefreshNonce(0);
    recentLinesRef.current = [];
    lastFocusKeyRef.current = null;
  }, [plan?.summary]);

  useEffect(() => {
    if (!isAutoPlaying || !simulation || typeof window === "undefined") {
      return;
    }

    let frameId = 0;
    let lastTimestamp = window.performance.now();

    const tick = (timestamp: number) => {
      const deltaMs = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      setProgressPercent((current) => {
        const next = current + (deltaMs / DEMO_AUTOPLAY_DURATION_MS) * 100;
        if (next >= 100) {
          setIsAutoPlaying(false);
          return 100;
        }
        return next;
      });
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isAutoPlaying, simulation]);

  useEffect(() => {
    if (!plan || !destination || !commentaryRequest) {
      return;
    }

    const focusKey = commentaryRequest.focusKey;
    if (lastFocusKeyRef.current === focusKey) {
      return;
    }

    lastFocusKeyRef.current = focusKey;
    const controller = new AbortController();

    startTransition(() => {
      setCommentary((current) => ({
        ...current,
        status: "loading",
        error: null,
      }));
    });

    fetch("/api/navigation/commentary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(commentaryRequest.payload),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : `Navigation commentary failed: ${response.status}`,
          );
        }
        return payload as {
          commentary: string;
          focus: "poi" | "destination";
          model: string;
          usedLive: boolean;
        };
      })
      .then((payload) => {
        const nextRecentLines = [
          ...recentLinesRef.current,
          payload.commentary,
        ].slice(-4);
        recentLinesRef.current = nextRecentLines;

        startTransition(() => {
          setCommentary({
            beatKey: focusKey,
            focusPoiId: openingPoi?.id ?? nextPoi?.id ?? destination.id,
            text: payload.commentary,
            focus: payload.focus,
            model: payload.model,
            usedLive: payload.usedLive,
            status: "ready",
            error: null,
          });
        });
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) {
          return;
        }

        startTransition(() => {
          setCommentary({
            beatKey: focusKey,
            focusPoiId: openingPoi?.id ?? nextPoi?.id ?? destination.id,
            text: nextPoi
              ? commentaryRequest.minutesUntilFocus !== null
                ? `${nextPoi.title} is about ${commentaryRequest.minutesUntilFocus} minutes ahead, so stay with the route as ${nextPoi.placeName} comes into view.`
                : `${nextPoi.title} is coming up next. This is one of the signature moments on your route.`
              : commentaryRequest.minutesUntilDestination !== null
                ? `${destination.placeName} is about ${commentaryRequest.minutesUntilDestination} minutes out, so this final stretch is all about setting up the arrival.`
                : `${destination.placeName} is ahead. The destination is the last anchor point on this route.`,
            focus: nextPoi ? "poi" : "destination",
            model: null,
            usedLive: false,
            status: "error",
            error: error.message,
          });
        });
      });

    return () => controller.abort();
  }, [
    commentaryRequest,
    destination,
    openingPoi,
    nextPoi,
    plan,
  ]);

  return {
    city: plan?.city ?? null,
    enabled: Boolean(plan?.stops.length && currentPosition && destination),
    progressPercent,
    setProgressPercent: setManualProgressPercent,
    isAutoPlaying,
    startAutoPlay,
    stopAutoPlay,
    currentPosition,
    nextPoi,
    destination,
    upcomingPois,
    currentTimeLabel: timingSnapshot.currentTimeLabel,
    minutesUntilFocus: timingSnapshot.minutesUntilFocus,
    minutesUntilDestination: timingSnapshot.minutesUntilDestination,
    routePhase: timingSnapshot.routePhase,
    commentary,
    refreshCommentary: () => {
      lastFocusKeyRef.current = null;
      setRefreshNonce((value) => value + 1);
    },
  };
}
