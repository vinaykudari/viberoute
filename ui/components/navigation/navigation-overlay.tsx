"use client";

import { useMemo } from "react";
import type { DemoNavigationState } from "@/lib/navigation/use-demo-navigation";
import { usePoiSlideshows } from "@/lib/navigation/use-poi-slideshows";
import { useTourMode } from "@/lib/navigation/use-tour-mode";
import { TourLauncher } from "./tour-launcher";
import { TourPanel } from "./tour-panel";

export function NavigationOverlay({
  navigation,
}: {
  navigation: DemoNavigationState;
}) {
  if (!navigation.enabled || !navigation.destination) {
    return null;
  }

  const prefetchPois = useMemo(
    () => {
      const items = [
        navigation.nextPoi ?? navigation.destination,
        ...navigation.upcomingPois.filter(
          (poi) =>
            poi.id !== navigation.nextPoi?.id &&
            poi.id !== navigation.destination?.id,
        ),
        navigation.destination,
      ];

      return items
        .filter(
          (poi): poi is NonNullable<(typeof items)[number]> => Boolean(poi),
        )
        .slice(0, 4);
    },
    [
      navigation.destination,
      navigation.nextPoi,
      navigation.upcomingPois,
    ],
  );
  usePoiSlideshows({
    city: navigation.city,
    pois: prefetchPois,
    enabled: navigation.enabled,
  });

  const tour = useTourMode(navigation);

  if (!tour.isOpen) {
    return <TourLauncher onStart={tour.open} />;
  }

  return <TourPanel navigation={navigation} tour={tour} />;
}
