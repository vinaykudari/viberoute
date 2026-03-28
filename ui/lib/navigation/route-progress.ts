import type { DayPlan } from "@viberoute/shared";

export type NavigationCoordinate = {
  lat: number;
  lng: number;
};

export type RouteStopProgress = {
  stopId: string;
  progressRatio: number;
};

export type RouteSegmentProgress = {
  id: string;
  mode: DayPlan["segments"][number]["mode"];
  startRatio: number;
  endRatio: number;
};

export type RouteSimulation = {
  coordinates: NavigationCoordinate[];
  stopProgress: RouteStopProgress[];
  segmentProgress: RouteSegmentProgress[];
  totalDistanceMeters: number;
};

export function buildRouteSimulation(plan?: DayPlan): RouteSimulation | null {
  if (!plan?.stops.length) {
    return null;
  }

  if (plan.stops.length === 1) {
    const [stop] = plan.stops;
    return {
      coordinates: [{ lat: stop.lat, lng: stop.lng }],
      stopProgress: [{ stopId: stop.id, progressRatio: 1 }],
      segmentProgress: [],
      totalDistanceMeters: 0,
    };
  }

  const coordinates: NavigationCoordinate[] = [];
  const stopProgress: RouteStopProgress[] = [
    { stopId: plan.stops[0].id, progressRatio: 0 },
  ];
  const segmentProgress: RouteSegmentProgress[] = [];

  let totalDistanceMeters = 0;
  let traversedDistanceMeters = 0;

  for (let index = 0; index < plan.stops.length - 1; index += 1) {
    const currentStop = plan.stops[index];
    const nextStop = plan.stops[index + 1];
    const segment =
      plan.segments.find(
        (item) =>
          item.fromStopId === currentStop.id && item.toStopId === nextStop.id,
      ) ?? plan.segments[index];

    const segmentCoordinates = dedupeCoordinates(
      segment?.path?.length
        ? segment.path.map((point) => ({ lat: point.lat, lng: point.lng }))
        : [
            { lat: currentStop.lat, lng: currentStop.lng },
            { lat: nextStop.lat, lng: nextStop.lng },
          ],
    );

    if (!coordinates.length) {
      coordinates.push(...segmentCoordinates);
    } else {
      coordinates.push(...segmentCoordinates.slice(1));
    }

    const segmentDistanceMeters = measurePolylineDistance(segmentCoordinates);
    const nextTraversedDistance = traversedDistanceMeters + segmentDistanceMeters;
    totalDistanceMeters += segmentDistanceMeters;

    segmentProgress.push({
      id: segment?.id ?? `${currentStop.id}-${nextStop.id}`,
      mode: segment?.mode ?? "drive",
      startRatio: traversedDistanceMeters,
      endRatio: nextTraversedDistance,
    });

    traversedDistanceMeters = nextTraversedDistance;
    stopProgress.push({
      stopId: nextStop.id,
      progressRatio: traversedDistanceMeters,
    });
  }

  if (!totalDistanceMeters) {
    return {
      coordinates,
      stopProgress: plan.stops.map((stop, index) => ({
        stopId: stop.id,
        progressRatio:
          plan.stops.length === 1 ? 1 : index / (plan.stops.length - 1),
      })),
      segmentProgress: segmentProgress.map((segment, index) => ({
        ...segment,
        startRatio: index / Math.max(segmentProgress.length, 1),
        endRatio: (index + 1) / Math.max(segmentProgress.length, 1),
      })),
      totalDistanceMeters,
    };
  }

  return {
    coordinates,
    stopProgress: stopProgress.map((stop) => ({
      ...stop,
      progressRatio: clamp(stop.progressRatio / totalDistanceMeters, 0, 1),
    })),
    segmentProgress: segmentProgress.map((segment) => ({
      ...segment,
      startRatio: clamp(segment.startRatio / totalDistanceMeters, 0, 1),
      endRatio: clamp(segment.endRatio / totalDistanceMeters, 0, 1),
    })),
    totalDistanceMeters,
  };
}

export function sampleRoutePosition(
  simulation: RouteSimulation | null,
  progressRatio: number,
): NavigationCoordinate | undefined {
  if (!simulation?.coordinates.length) {
    return undefined;
  }

  if (simulation.coordinates.length === 1) {
    return simulation.coordinates[0];
  }

  const clampedProgress = clamp(progressRatio, 0, 1);
  const targetDistance =
    simulation.totalDistanceMeters * clampedProgress;

  let traversedDistance = 0;
  for (let index = 0; index < simulation.coordinates.length - 1; index += 1) {
    const current = simulation.coordinates[index];
    const next = simulation.coordinates[index + 1];
    const segmentDistance = measureDistanceMeters(current, next);

    if (!segmentDistance) {
      continue;
    }

    if (traversedDistance + segmentDistance >= targetDistance) {
      const segmentProgress =
        (targetDistance - traversedDistance) / segmentDistance;
      return {
        lat: current.lat + (next.lat - current.lat) * segmentProgress,
        lng: current.lng + (next.lng - current.lng) * segmentProgress,
      };
    }

    traversedDistance += segmentDistance;
  }

  return simulation.coordinates.at(-1);
}

export function getSegmentAtProgress(
  simulation: RouteSimulation | null,
  progressRatio: number,
): RouteSegmentProgress | undefined {
  if (!simulation?.segmentProgress.length) {
    return undefined;
  }

  const clampedProgress = clamp(progressRatio, 0, 1);
  return (
    simulation.segmentProgress.find(
      (segment) =>
        clampedProgress >= segment.startRatio &&
        clampedProgress <= segment.endRatio,
    ) ?? simulation.segmentProgress.at(-1)
  );
}

function dedupeCoordinates(
  coordinates: NavigationCoordinate[],
): NavigationCoordinate[] {
  return coordinates.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    const previous = coordinates[index - 1];
    return previous.lat !== point.lat || previous.lng !== point.lng;
  });
}

function measurePolylineDistance(coordinates: NavigationCoordinate[]): number {
  let total = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    total += measureDistanceMeters(coordinates[index], coordinates[index + 1]);
  }

  return total;
}

function measureDistanceMeters(
  start: NavigationCoordinate,
  end: NavigationCoordinate,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
