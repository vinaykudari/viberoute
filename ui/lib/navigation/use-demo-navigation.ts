"use client";

import type {
  DayPlan,
  MapHighlightCard,
  PlannerChatImage,
  SceneIntent,
  WeatherSnapshot,
} from "@viberoute/shared";
import {
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

type CommentaryState = {
  text: string;
  focus: "poi" | "destination" | null;
  model: string | null;
  usedLive: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

export type DemoNavigationState = {
  enabled: boolean;
  progressPercent: number;
  setProgressPercent: (value: number) => void;
  currentPosition?: { lat: number; lng: number };
  nextPoi?: NavigationPoiCard;
  destination?: NavigationPoiCard;
  upcomingPois: NavigationPoiCard[];
  commentary: CommentaryState;
  refreshCommentary: () => void;
};

const INITIAL_COMMENTARY: CommentaryState = {
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

  const activeSegment = useMemo(
    () => getSegmentAtProgress(simulation, deferredProgressRatio),
    [deferredProgressRatio, simulation],
  );

  useEffect(() => {
    setProgressPercent(0);
    setCommentary(INITIAL_COMMENTARY);
    setRefreshNonce(0);
    recentLinesRef.current = [];
    lastFocusKeyRef.current = null;
  }, [plan?.summary]);

  useEffect(() => {
    if (!plan || !destination) {
      return;
    }

    const focusKey = `${nextPoi ? `poi:${nextPoi.id}` : `destination:${destination.id}`}:${refreshNonce}`;
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

    const remainingPoiCount = poiCards.filter(
      (poi) => !poi.isDestination && poi.progressRatio > deferredProgressRatio + 0.01,
    ).length;

    fetch("/api/navigation/commentary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        city: plan.city,
        routeSummary: plan.summary,
        progressPercent: deferredProgressPercent,
        travelMode: activeSegment?.mode ?? null,
        weatherSummary: weather?.summary ?? null,
        nextPoi: nextPoi
          ? {
              id: nextPoi.id,
              title: nextPoi.title,
              placeName: nextPoi.placeName,
              detail: nextPoi.detail ?? null,
              lat: nextPoi.lat,
              lng: nextPoi.lng,
              color: nextPoi.color,
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
          etaLabel: destination.etaLabel ?? null,
        },
        remainingPoiCount,
        recentLines: recentLinesRef.current,
      }),
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
            text: nextPoi
              ? `${nextPoi.title} is coming up next. This is one of the signature moments on your route.`
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
    activeSegment?.mode,
    deferredProgressPercent,
    deferredProgressRatio,
    destination,
    nextPoi,
    plan,
    poiCards,
    refreshNonce,
    weather?.summary,
  ]);

  return {
    enabled: Boolean(plan?.stops.length && currentPosition && destination),
    progressPercent,
    setProgressPercent,
    currentPosition,
    nextPoi,
    destination,
    upcomingPois,
    commentary,
    refreshCommentary: () => {
      lastFocusKeyRef.current = null;
      setRefreshNonce((value) => value + 1);
    },
  };
}
