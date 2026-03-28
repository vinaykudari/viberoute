"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NavigationPoiCard } from "./navigation-pois";

export type PoiSlideshowImage = {
  id: string;
  url: string;
  alt: string;
  source: "upload" | "openverse" | "wikipedia";
  sourceLabel: string;
  pageUrl?: string | null;
  attribution?: string | null;
};

type SlidesByPoiId = Record<string, PoiSlideshowImage[]>;

const slideshowCache = new Map<string, PoiSlideshowImage[]>();
const slideshowInflight = new Map<string, Promise<PoiSlideshowImage[]>>();

export function usePoiSlideshows(options: {
  city?: string | null;
  pois: NavigationPoiCard[];
  enabled: boolean;
}): SlidesByPoiId {
  const { city, pois, enabled } = options;
  const [slidesByPoiId, setSlidesByPoiId] = useState<SlidesByPoiId>({});
  const hydratedKeysRef = useRef<Set<string>>(new Set());

  const targets = useMemo(() => pois.slice(0, 3), [pois]);
  const targetKey = useMemo(
    () =>
      targets
        .map((poi) => `${poi.id}:${poi.placeName}:${poi.title}`)
        .join("|"),
    [targets],
  );

  useEffect(() => {
    if (!enabled || !targets.length) {
      return;
    }

    const controller = new AbortController();

    for (const poi of targets) {
      const cacheKey = `${(city ?? "").trim().toLowerCase()}|${poi.placeName.trim().toLowerCase()}`;
      const localSlide = buildLocalSlides(poi);
      const cached = slideshowCache.get(cacheKey);

      if (cached) {
        hydratedKeysRef.current.add(cacheKey);
        setSlidesByPoiId((current) => ({
          ...current,
          [poi.id]: mergeSlides(localSlide, cached),
        }));
        continue;
      }

      setSlidesByPoiId((current) => ({
        ...current,
        [poi.id]: localSlide,
      }));

      if (hydratedKeysRef.current.has(cacheKey)) {
        continue;
      }

      hydratedKeysRef.current.add(cacheKey);
      void loadRemoteSlides({
        cacheKey,
        city,
        placeName: poi.placeName,
        title: poi.title,
      })
        .then((remoteSlides) => {
          if (controller.signal.aborted) {
            return;
          }

          setSlidesByPoiId((current) => ({
            ...current,
            [poi.id]: mergeSlides(localSlide, remoteSlides),
          }));
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return;
          }

          setSlidesByPoiId((current) => ({
            ...current,
            [poi.id]: localSlide,
          }));
        });
    }

    return () => controller.abort();
  }, [city, enabled, targetKey, targets]);

  return slidesByPoiId;
}

function loadRemoteSlides(options: {
  cacheKey: string;
  city?: string | null;
  placeName: string;
  title: string;
}) {
  const { cacheKey, city, placeName, title } = options;
  const cached = slideshowCache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = slideshowInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = fetch("/api/navigation/poi-images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city,
      placeName,
      title,
    }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`POI slideshow failed: ${response.status}`);
      }

      return (await response.json()) as { images?: PoiSlideshowImage[] };
    })
    .then((payload) => {
      const remoteSlides = payload.images ?? [];
      slideshowCache.set(cacheKey, remoteSlides);
      slideshowInflight.delete(cacheKey);
      return remoteSlides;
    })
    .catch((error) => {
      slideshowInflight.delete(cacheKey);
      throw error;
    });

  slideshowInflight.set(cacheKey, request);
  return request;
}

function buildLocalSlides(poi: NavigationPoiCard): PoiSlideshowImage[] {
  if (!poi.imageUrl) {
    return [];
  }

  return [
    {
      id: `upload:${poi.id}`,
      url: poi.imageUrl,
      alt: poi.title,
      source: "upload",
      sourceLabel: "Uploads",
    },
  ];
}

function mergeSlides(
  localSlides: PoiSlideshowImage[],
  remoteSlides: PoiSlideshowImage[],
): PoiSlideshowImage[] {
  const seenUrls = new Set<string>();
  const merged: PoiSlideshowImage[] = [];

  for (const slide of [...localSlides, ...remoteSlides]) {
    if (!slide.url || seenUrls.has(slide.url)) {
      continue;
    }

    seenUrls.add(slide.url);
    merged.push(slide);
  }

  return merged;
}
