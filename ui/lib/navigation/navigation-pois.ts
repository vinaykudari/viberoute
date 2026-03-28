import type {
  DayPlan,
  MapHighlightCard,
  NavigationPoi,
  PlannerChatImage,
  SceneIntent,
} from "@viberoute/shared";
import type { RouteStopProgress } from "./route-progress";

export type NavigationPoiCard = NavigationPoi & {
  imageUrl?: string;
  progressRatio: number;
  sourceImageIds: string[];
  isDestination: boolean;
};

export function buildNavigationPoiCards(options: {
  plan?: DayPlan;
  images: PlannerChatImage[];
  scenes: SceneIntent[];
  mapHighlights: MapHighlightCard[];
  stopProgress: RouteStopProgress[];
}): NavigationPoiCard[] {
  const { plan, images, scenes, mapHighlights, stopProgress } = options;

  if (!plan?.stops.length) {
    return [];
  }

  const stopProgressById = new Map(
    stopProgress.map((stop) => [stop.stopId, stop.progressRatio]),
  );

  return plan.stops.map((stop, index) => {
    const highlight =
      mapHighlights.find((card) =>
        stop.sourceImageIds.includes(card.sourceImageId),
      ) ?? mapHighlights[index];

    const isDestination = index === plan.stops.length - 1;
    const color = isDestination
      ? "#f97316"
      : index === 0
        ? "#34d399"
        : stop.routeColor;

    return {
      id: stop.id,
      title: stop.title,
      placeName: highlight?.placeName ?? stop.title,
      detail: highlight?.detail ?? stop.rationale,
      lat: stop.lat,
      lng: stop.lng,
      color,
      etaLabel: formatIsoTime(stop.startTimeIso),
      imageUrl: resolveImageUrl(stop.sourceImageIds, images, scenes),
      progressRatio: stopProgressById.get(stop.id) ?? 0,
      sourceImageIds: stop.sourceImageIds,
      isDestination,
    };
  });
}

function resolveImageUrl(
  sourceImageIds: string[],
  images: PlannerChatImage[],
  scenes: SceneIntent[],
): string | undefined {
  for (const sourceImageId of sourceImageIds) {
    const byFilename = images.find((image) => image.filename === sourceImageId);
    if (byFilename) {
      return byFilename.dataUrl;
    }

    const sceneIndex = scenes.findIndex((scene) => scene.imageId === sourceImageId);
    if (sceneIndex >= 0 && images[sceneIndex]) {
      return images[sceneIndex].dataUrl;
    }
  }

  return images[0]?.dataUrl;
}

function formatIsoTime(value: string): string {
  const offsetMatch = value.match(/([+-]\d{2}:\d{2})$/);
  if (offsetMatch) {
    const localPart = value.slice(0, value.length - 6);
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
