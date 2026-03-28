"use client";

import type { DemoNavigationState } from "@/lib/navigation/use-demo-navigation";
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

  const tour = useTourMode(navigation);

  if (!tour.isOpen) {
    return <TourLauncher onStart={tour.open} />;
  }

  return <TourPanel navigation={navigation} tour={tour} />;
}
