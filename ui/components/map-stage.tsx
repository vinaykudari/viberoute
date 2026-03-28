"use client";

import type {
  DayPlan,
  MapHighlightCard,
  PlannerChatImage,
  ProvisionalMapPoint,
  SceneIntent,
  WeatherSnapshot,
} from "@viberoute/shared";
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map,
  type StyleSpecification,
} from "maplibre-gl";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { MapHighlightRail } from "./map-highlight-rail";

type MapStageProps = {
  initialCenter?: {
    lat: number;
    lng: number;
  };
  plan?: DayPlan;
  provisionalPoints: ProvisionalMapPoint[];
  mapHighlights: MapHighlightCard[];
  weather?: WeatherSnapshot | null;
  images: PlannerChatImage[];
  scenes: SceneIntent[];
  reasoningText?: string | null;
};

type DisplayPoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: string;
  color: string;
};

type PlanMomentMarker = {
  id: string;
  kind: "start" | "stop" | "end";
  title: string;
  reachByLabel: string;
  visitMinutes: number | null;
  travelMinutes: number | null;
  travelMode: "walk" | "drive" | "transit" | null;
  sourceImageIds: string[];
  lat: number;
  lng: number;
  color: string;
};

const DEFAULT_CENTER = {
  lat: 37.773972,
  lng: -122.431297,
};

const MOMENT_MARKER_WIDTH = 212;
const MOMENT_MARKER_EDGE_PADDING = 18;

const SLEEK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    stadia: {
      type: "raster",
      tiles: [
        "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
    },
  },
  layers: [
    {
      id: "stadia",
      type: "raster",
      source: "stadia",
    },
  ],
};

function createRouteFeatureCollection(plan?: DayPlan) {
  return {
    type: "FeatureCollection" as const,
    features: (plan?.segments ?? []).map((segment) => ({
      type: "Feature" as const,
      properties: {
        routeColor: segment.routeColor,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: segment.path.map((point) => [point.lng, point.lat]),
      },
    })),
  };
}

function createPointFeatureCollection(
  plan: DayPlan | undefined,
  provisionalPoints: ProvisionalMapPoint[],
) {
  // When a plan exists, plan stops are rendered by moment markers (image thumbnails),
  // so suppress ALL GeoJSON circles to avoid duplicate dots.
  if (plan?.stops.length) {
    return {
      type: "FeatureCollection" as const,
      features: [],
    };
  }

  const points: DisplayPoint[] = collectDisplayPoints(plan, provisionalPoints);

  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      properties: {
        kind: point.kind,
        color: point.color,
        label: point.label,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [point.lng, point.lat],
      },
    })),
  };
}

function collectDisplayPoints(
  plan: DayPlan | undefined,
  provisionalPoints: ProvisionalMapPoint[],
): DisplayPoint[] {
  const committedProvisionalPoints = plan?.stops.length ? [] : provisionalPoints;
  const stopCount = plan?.stops.length ?? 0;
  return [
    ...committedProvisionalPoints.map((point) => ({
      id: point.id,
      label: point.label,
      lat: point.lat,
      lng: point.lng,
      kind: point.kind,
      color: point.color,
    })),
    ...(plan?.stops ?? []).map((stop, index) => ({
      id: stop.id,
      label: stop.title,
      lat: stop.lat,
      lng: stop.lng,
      kind:
        stopCount <= 1
          ? "start"
          : index === 0
            ? "start"
            : index === stopCount - 1
              ? "end"
              : "stop",
      color:
        stopCount <= 1
          ? "#34d399"
          : index === 0
            ? "#34d399"
            : index === stopCount - 1
              ? "#f97316"
              : stop.routeColor,
    })),
  ];
}

function syncPointLabelMarkers(
  map: Map,
  points: DisplayPoint[],
  labelMarkersRef: MutableRefObject<maplibregl.Marker[]>,
) {
  for (const marker of labelMarkersRef.current) {
    marker.remove();
  }

  labelMarkersRef.current = points
    .filter(
      (point) =>
        point.label.trim().length > 0 &&
        point.kind === "candidate",
    )
    .map((point) => {
      const element = document.createElement("div");
      element.textContent = point.label;
      element.style.pointerEvents = "none";
      element.style.maxWidth = "180px";
      element.style.padding = "4px 8px";
      element.style.border = "1px solid rgba(255, 255, 255, 0.08)";
      element.style.borderRadius = "999px";
      element.style.background = "rgba(14, 15, 20, 0.94)";
      element.style.color = "rgba(255, 255, 255, 0.92)";
      element.style.boxShadow = "0 12px 24px rgba(0, 0, 0, 0.28)";
      element.style.fontSize = "11px";
      element.style.fontWeight = "600";
      element.style.lineHeight = "1.2";
      element.style.letterSpacing = "-0.01em";
      element.style.whiteSpace = "nowrap";
      element.style.overflow = "hidden";
      element.style.textOverflow = "ellipsis";

      return new maplibregl.Marker({
        element,
        anchor: "bottom",
        offset: [0, -14],
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
    });
}

function _buildMetricTag(text: string): HTMLDivElement {
  const tag = document.createElement("div");
  tag.textContent = text;
  tag.style.padding = "2px 6px";
  tag.style.borderRadius = "4px";
  tag.style.background = "rgba(255,255,255,0.06)";
  tag.style.fontSize = "10px";
  tag.style.fontWeight = "500";
  tag.style.color = "rgba(255,255,255,0.62)";
  tag.style.whiteSpace = "nowrap";
  return tag;
}

function _travelModeLabel(mode: "walk" | "drive" | "transit" | null): string {
  return { walk: "Walk", drive: "Drive", transit: "Transit" }[mode ?? "drive"];
}

function _findImageUrl(
  moment: PlanMomentMarker,
  images: PlannerChatImage[],
  scenes: SceneIntent[],
): string | undefined {
  // Match sourceImageIds → scene.imageId → image.filename → image.dataUrl
  for (const sid of moment.sourceImageIds) {
    // Direct filename match
    const byFilename = images.find((img) => img.filename === sid);
    if (byFilename) return byFilename.dataUrl;

    // Scene lookup: find scene with this imageId, then match image index
    const sceneIdx = scenes.findIndex((s) => s.imageId === sid);
    if (sceneIdx >= 0 && sceneIdx < images.length) {
      return images[sceneIdx].dataUrl;
    }
  }
  return images[0]?.dataUrl;
}

function getMomentMarkerPlacement(
  map: Map,
  moment: PlanMomentMarker,
): {
  labelSide: "left" | "right";
} {
  const { clientWidth } = map.getContainer();
  const projected = map.project([moment.lng, moment.lat]);
  const nearRight =
    projected.x > clientWidth - MOMENT_MARKER_WIDTH - MOMENT_MARKER_EDGE_PADDING;

  return {
    labelSide: nearRight ? "left" : "right",
  };
}

function syncPlanMomentMarkers(
  map: Map,
  plan: DayPlan | undefined,
  momentMarkersRef: MutableRefObject<maplibregl.Marker[]>,
  images: PlannerChatImage[],
  scenes: SceneIntent[],
) {
  for (const marker of momentMarkersRef.current) {
    marker.remove();
  }

  const moments = collectPlanMomentMarkers(plan);
  momentMarkersRef.current = moments.map((moment, index) => {
    const placement = getMomentMarkerPlacement(map, moment);
    const shell = document.createElement("div");
    shell.style.pointerEvents = "none";
    shell.style.position = "relative";
    shell.style.width = "36px";
    shell.style.height = "36px";
    shell.style.overflow = "visible";

    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = "36px";
    wrapper.style.height = "36px";
    wrapper.style.overflow = "visible";
    wrapper.style.maxWidth = `${MOMENT_MARKER_WIDTH}px`;

    /* ── Image thumbnail (circle) ── */
    const imgUrl = _findImageUrl(moment, images, scenes);
    const thumb = document.createElement("div");
    thumb.style.position = "absolute";
    thumb.style.left = "0";
    thumb.style.top = "0";
    thumb.style.width = "36px";
    thumb.style.height = "36px";
    thumb.style.borderRadius = "999px";
    thumb.style.border = `2px solid ${moment.color}`;
    thumb.style.flexShrink = "0";
    thumb.style.overflow = "hidden";
    thumb.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
    if (imgUrl) {
      thumb.style.backgroundImage = `url(${imgUrl})`;
      thumb.style.backgroundSize = "cover";
      thumb.style.backgroundPosition = "center";
    } else {
      thumb.style.background = moment.color;
    }

    /* ── Text column: title + arrive by ── */
    const textCol = document.createElement("div");
    textCol.style.display = "flex";
    textCol.style.flexDirection = "column";
    textCol.style.gap = "1px";
    textCol.style.position = "absolute";
    textCol.style.top = "50%";
    textCol.style.transform = "translateY(-50%)";
    textCol.style.maxWidth = "156px";
    textCol.style.minWidth = "0";
    if (placement.labelSide === "left") {
      textCol.style.right = "48px";
      textCol.style.textAlign = "right";
      textCol.style.alignItems = "flex-end";
    } else {
      textCol.style.left = "48px";
      textCol.style.textAlign = "left";
      textCol.style.alignItems = "flex-start";
    }

    const title = document.createElement("div");
    title.textContent = moment.title;
    title.style.fontSize = "11px";
    title.style.fontWeight = "700";
    title.style.lineHeight = "1.2";
    title.style.color = "rgba(255,255,255,0.92)";
    title.style.whiteSpace = "nowrap";
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";
    title.style.textShadow = "0 1px 4px rgba(0,0,0,0.8)";

    const bestTime = document.createElement("div");
    bestTime.textContent = `Best around ${moment.reachByLabel}`;
    bestTime.style.fontSize = "10px";
    bestTime.style.fontWeight = "500";
    bestTime.style.color = "rgba(255,255,255,0.58)";
    bestTime.style.whiteSpace = "nowrap";
    bestTime.style.overflow = "hidden";
    bestTime.style.textOverflow = "ellipsis";
    bestTime.style.textShadow = "0 1px 4px rgba(0,0,0,0.8)";

    textCol.appendChild(title);
    textCol.appendChild(bestTime);

    wrapper.appendChild(thumb);
    wrapper.appendChild(textCol);
    wrapper.style.opacity = "0";
    shell.appendChild(wrapper);

    // Create the marker first so MapLibre can position it, then animate.
    const marker = new maplibregl.Marker({
      element: shell,
      anchor: "center",
      offset: [0, 0],
    })
      .setLngLat([moment.lng, moment.lat])
      .addTo(map);

    // Defer the entrance animation to the next frame so MapLibre
    // has already placed the element at the correct screen position.
    requestAnimationFrame(() => {
      wrapper.animate(
        [
          { transform: "translateY(8px)", opacity: 0 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        {
          duration: 380,
          delay: index * 60,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          fill: "forwards",
        },
      );
    });

    return marker;
  });
}

function collectPlanMomentMarkers(plan: DayPlan | undefined): PlanMomentMarker[] {
  if (!plan?.stops.length) {
    return [];
  }

  const stopCount = plan.stops.length;
  return plan.stops.map((stop, index) => {
    const kind: PlanMomentMarker["kind"] =
      index === 0 ? "start" : index === stopCount - 1 ? "end" : "stop";
    const color =
      index === 0
        ? "#34d399"
        : index === stopCount - 1
          ? "#f97316"
          : stop.routeColor;

    return {
      id: `${kind}-${stop.id}`,
      kind,
      title: stop.title,
      reachByLabel: formatIsoTime(stop.startTimeIso),
      visitMinutes: stop.visitDurationMinutes ?? null,
      travelMinutes: stop.travelMinutesFromPrevious ?? null,
      travelMode: stop.travelModeFromPrevious ?? null,
      sourceImageIds: stop.sourceImageIds,
      lat: stop.lat,
      lng: stop.lng,
      color,
    };
  });
}

function formatIsoTime(value: string): string {
  // Extract the local date/time portion from the ISO string so
  // we always display the destination's local time, regardless of
  // the browser's timezone.
  const offsetMatch = value.match(/([+-]\d{2}:\d{2})$/);
  if (offsetMatch) {
    const localPart = value.slice(0, value.length - 6); // strip offset
    const asUtc = new Date(`${localPart}Z`);
    if (!Number.isNaN(asUtc.getTime())) {
      return asUtc.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      });
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBounds(
  plan: DayPlan | undefined,
  provisionalPoints: ProvisionalMapPoint[],
): LngLatBoundsLike | null {
  const committedProvisionalPoints = plan?.stops.length ? [] : provisionalPoints;
  const coordinates = [
    ...(plan?.stops ?? []).map((stop) => [stop.lng, stop.lat] as [number, number]),
    ...committedProvisionalPoints.map((point) => [point.lng, point.lat] as [number, number]),
  ];

  if (!coordinates.length) {
    return null;
  }

  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];

  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function getCoordinates(
  plan: DayPlan | undefined,
  provisionalPoints: ProvisionalMapPoint[],
): [number, number][] {
  const committedProvisionalPoints = plan?.stops.length ? [] : provisionalPoints;
  return [
    ...(plan?.stops ?? []).map((stop) => [stop.lng, stop.lat] as [number, number]),
    ...committedProvisionalPoints.map((point) => [point.lng, point.lat] as [number, number]),
  ];
}

function focusMap(
  map: Map,
  plan: DayPlan | undefined,
  provisionalPoints: ProvisionalMapPoint[],
  fallbackCenter: { lat: number; lng: number },
  duration: number,
  hasMapHighlights: boolean,
) {
  const offsetY = hasMapHighlights ? -92 : 0;
  const coordinates = getCoordinates(plan, provisionalPoints);
  if (coordinates.length === 1) {
    const [lng, lat] = coordinates[0];
    map.easeTo({
      center: [lng, lat],
      zoom: 13.8,
      offset: [0, offsetY],
      duration,
      essential: true,
    });
    return;
  }

  const bounds = getBounds(plan, provisionalPoints);
  if (bounds) {
    map.fitBounds(bounds, {
      padding: {
        top: 136,
        right: 120,
        bottom: hasMapHighlights ? 236 : 108,
        left: 148,
      },
      maxZoom: 13.6,
      duration,
      essential: true,
    });
    return;
  }

  map.easeTo({
    center: [fallbackCenter.lng, fallbackCenter.lat],
    zoom: 11.5,
    offset: [0, offsetY],
    duration,
    essential: true,
  });
}

export function MapStage({
  initialCenter,
  plan,
  provisionalPoints,
  mapHighlights,
  weather,
  images,
  scenes,
  reasoningText,
}: MapStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const momentMarkersRef = useRef<maplibregl.Marker[]>([]);

  const routeData = useMemo(() => createRouteFeatureCollection(plan), [plan]);
  const displayPoints = useMemo(
    () => collectDisplayPoints(plan, provisionalPoints),
    [plan, provisionalPoints],
  );
  const pointData = useMemo(
    () => createPointFeatureCollection(plan, provisionalPoints),
    [plan, provisionalPoints],
  );

  const routeDataRef = useRef(routeData);
  const pointDataRef = useRef(pointData);
  const planRef = useRef(plan);
  const provisionalPointsRef = useRef(provisionalPoints);
  const initialCenterRef = useRef(initialCenter);
  const imagesRef = useRef(images);
  const scenesRef = useRef(scenes);

  routeDataRef.current = routeData;
  pointDataRef.current = pointData;
  planRef.current = plan;
  provisionalPointsRef.current = provisionalPoints;
  initialCenterRef.current = initialCenter;
  imagesRef.current = images;
  scenesRef.current = scenes;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const center = initialCenterRef.current ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SLEEK_STYLE,
      center: [center.lng, center.lat],
      zoom: 11.5,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );

    map.on("load", () => {
      map.addSource("route-segments", {
        type: "geojson",
        data: routeDataRef.current,
      });

      map.addLayer({
        id: "route-segments",
        type: "line",
        source: "route-segments",
        paint: {
          "line-color": ["get", "routeColor"],
          "line-width": 5,
          "line-opacity": 0.9,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      map.addSource("planner-points", {
        type: "geojson",
        data: pointDataRef.current,
      });

      map.addLayer({
        id: "planner-points",
        type: "circle",
        source: "planner-points",
        paint: {
          "circle-radius": [
            "match",
            ["get", "kind"],
            "candidate",
            5,
            "start",
            7,
            "end",
            7,
            7,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      focusMap(
        map,
        planRef.current,
        provisionalPointsRef.current,
        center,
        0,
        mapHighlights.length > 0,
      );
      syncPointLabelMarkers(
        map,
        collectDisplayPoints(planRef.current, provisionalPointsRef.current),
        labelMarkersRef,
      );
      syncPlanMomentMarkers(map, planRef.current, momentMarkersRef, imagesRef.current, scenesRef.current);
    });

    mapRef.current = map;

    return () => {
      for (const marker of labelMarkersRef.current) {
        marker.remove();
      }
      labelMarkersRef.current = [];
      for (const marker of momentMarkersRef.current) {
        marker.remove();
      }
      momentMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      return;
    }

    const routeSource = map.getSource("route-segments") as
      | GeoJSONSource
      | undefined;
    const pointSource = map.getSource("planner-points") as
      | GeoJSONSource
      | undefined;

    routeSource?.setData(routeData);
    pointSource?.setData(pointData);
    syncPointLabelMarkers(map, displayPoints, labelMarkersRef);
    syncPlanMomentMarkers(map, plan, momentMarkersRef, images, scenes);

    const center = initialCenter ?? DEFAULT_CENTER;
    focusMap(
      map,
      plan,
      provisionalPoints,
      center,
      800,
      mapHighlights.length > 0,
    );
  }, [
    displayPoints,
    images,
    initialCenter,
    mapHighlights.length,
    plan,
    pointData,
    provisionalPoints,
    routeData,
    scenes,
  ]);

  const setMarkerVisibility = useCallback(
    (marker: maplibregl.Marker, visible: boolean) => {
      const shell = marker.getElement();
      // The wrapper is the first child — it has a fill:forwards animation
      // controlling its opacity, so we must override at the shell level.
      shell.style.transition = "opacity 0.2s ease";
      shell.style.opacity = visible ? "1" : "0";
      shell.style.pointerEvents = visible ? "none" : "none";
    },
    [],
  );

  const handleHoverCard = useCallback(
    (card: MapHighlightCard) => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded() || !plan) return;

      // Find the stop index that matches this card's sourceImageId
      const stopIndex = plan.stops.findIndex((s) =>
        s.sourceImageIds.includes(card.sourceImageId),
      );
      if (stopIndex < 0) return;

      // First card has no previous stop — do nothing
      if (stopIndex === 0) return;

      const prevStop = plan.stops[stopIndex - 1];
      const currentStop = plan.stops[stopIndex];

      // Highlight only the segment from previous stop → current stop
      map.setPaintProperty("route-segments", "line-opacity", [
        "case",
        [
          "all",
          ["==", ["get", "fromStopId"], prevStop.id],
          ["==", ["get", "toStopId"], currentStop.id],
        ],
        0.9,
        0.12,
      ]);

      // Show only previous + current moment markers, hide the rest
      const markers = momentMarkersRef.current;
      for (let i = 0; i < markers.length; i++) {
        setMarkerVisibility(markers[i], i === stopIndex - 1 || i === stopIndex);
      }
    },
    [plan, setMarkerVisibility],
  );

  const handleLeaveCard = useCallback(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.setPaintProperty("route-segments", "line-opacity", 0.9);

    // Restore all moment markers
    for (const marker of momentMarkersRef.current) {
      setMarkerVisibility(marker, true);
    }
  }, [setMarkerVisibility]);

  return (
    <section className="relative h-[calc(100vh-2rem)] overflow-hidden rounded-2xl border border-white/[0.06] shadow-2xl shadow-black/40">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute left-5 top-5 z-20">
        <span
          className="text-[22px] text-white drop-shadow-lg"
          style={{ fontFamily: "var(--font-pacifico)" }}
        >
          VibeRoute
        </span>
      </div>

      <div className="pointer-events-none absolute right-5 top-5 z-20 flex gap-2">
        {plan?.stops.length ? (
          <span className="rounded-lg border border-white/[0.06] bg-black/40 px-3 py-1.5 text-[11px] font-medium text-white/50 backdrop-blur-xl">
            {plan.stops.length} stops
          </span>
        ) : null}
      </div>

      {reasoningText && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/50 px-4 py-2 backdrop-blur-xl">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            <span className="max-w-[340px] truncate text-[11px] font-medium text-white/70">
              {reasoningText.split("\n").at(-1)}
            </span>
          </div>
        </div>
      )}

      <MapHighlightRail
        cards={mapHighlights}
        plan={plan}
        weather={weather}
        onFocusCard={(card) => {
          const map = mapRef.current;
          if (!map) {
            return;
          }

          map.easeTo({
            center: [card.lng, card.lat],
            zoom: 14.4,
            offset: [0, -92],
            duration: 850,
            essential: true,
          });
        }}
        onHoverCard={handleHoverCard}
        onLeaveCard={handleLeaveCard}
      />
    </section>
  );
}
