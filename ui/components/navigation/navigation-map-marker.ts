"use client";

import { Marker, type Map as MapLibreMap, type Marker as MapLibreMarker } from "maplibre-gl";
import type { MutableRefObject } from "react";

export function syncNavigationMarker(options: {
  markerRef: MutableRefObject<MapLibreMarker | null>;
  map: MapLibreMap;
  position?: { lat: number; lng: number };
  label: string;
}) {
  const { map, markerRef, position, label } = options;

  if (!position) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }

  if (!markerRef.current) {
    markerRef.current = new Marker({
      element: buildMarkerElement(label),
      anchor: "bottom",
      offset: [0, -10],
    })
      .setLngLat([position.lng, position.lat])
      .addTo(map);
    return;
  }

  updateMarkerLabel(markerRef.current.getElement(), label);
  markerRef.current.setLngLat([position.lng, position.lat]);
}

function buildMarkerElement(label: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "6px";

  const badge = document.createElement("div");
  badge.dataset.role = "gps-label";
  badge.textContent = label;
  badge.style.padding = "4px 8px";
  badge.style.borderRadius = "999px";
  badge.style.background = "rgba(8, 10, 14, 0.92)";
  badge.style.border = "1px solid rgba(255,255,255,0.08)";
  badge.style.boxShadow = "0 16px 28px rgba(0,0,0,0.35)";
  badge.style.color = "rgba(255,255,255,0.92)";
  badge.style.fontSize = "11px";
  badge.style.fontWeight = "700";
  badge.style.letterSpacing = "0.01em";
  badge.style.whiteSpace = "nowrap";

  const dotWrap = document.createElement("div");
  dotWrap.style.position = "relative";
  dotWrap.style.width = "22px";
  dotWrap.style.height = "22px";

  const pulse = document.createElement("div");
  pulse.style.position = "absolute";
  pulse.style.inset = "0";
  pulse.style.borderRadius = "999px";
  pulse.style.background = "rgba(34, 211, 238, 0.22)";
  pulse.style.animation = "viberoute-nav-pulse 1.8s ease-out infinite";

  const dot = document.createElement("div");
  dot.style.position = "absolute";
  dot.style.left = "50%";
  dot.style.top = "50%";
  dot.style.width = "10px";
  dot.style.height = "10px";
  dot.style.transform = "translate(-50%, -50%)";
  dot.style.borderRadius = "999px";
  dot.style.background = "#22d3ee";
  dot.style.border = "2px solid white";
  dot.style.boxShadow = "0 8px 18px rgba(34, 211, 238, 0.5)";

  dotWrap.appendChild(pulse);
  dotWrap.appendChild(dot);
  wrapper.appendChild(badge);
  wrapper.appendChild(dotWrap);

  ensurePulseKeyframes();
  return wrapper;
}

function updateMarkerLabel(element: HTMLElement, label: string) {
  const badge = element.querySelector<HTMLElement>("[data-role='gps-label']");
  if (badge) {
    badge.textContent = label;
  }
}

function ensurePulseKeyframes() {
  if (document.getElementById("viberoute-nav-pulse-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "viberoute-nav-pulse-style";
  style.textContent = `
    @keyframes viberoute-nav-pulse {
      0% { transform: scale(0.8); opacity: 0.72; }
      100% { transform: scale(1.8); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
