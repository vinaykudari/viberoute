"use client";

import type {
  PlannerChatImage,
  PlannerChatResponse,
  PlannerChatStateDelta,
} from "@viberoute/shared";
import { useCallback, useRef, useState } from "react";
import {
  mergePlannerState,
  mergePlannerStateDelta,
  initialPlannerState,
} from "@/lib/planner-state";
import { AssistantRuntimeShell } from "./assistant-runtime-provider";
import { ChatPanel } from "./chat-panel";
import { MapStage } from "./map-stage";

export function AppShell() {
  const [plannerState, setPlannerState] = useState(initialPlannerState);
  const [reasoningText, setReasoningText] = useState<string | null>(null);
  const handleReasoning = useCallback((text: string | null) => {
    setReasoningText(text);
  }, []);
  const handleCommittedImages = useCallback((images: PlannerChatImage[]) => {
    setPlannerState((current) => ({
      ...current,
      images,
    }));
  }, []);
  const handlePlannerResponse = useCallback(
    (response: PlannerChatResponse, images: PlannerChatImage[]) => {
      setPlannerState((current) => mergePlannerState(current, response, images));
    },
    [],
  );
  const handlePlannerStateDelta = useCallback((delta: PlannerChatStateDelta) => {
    setPlannerState((current) => mergePlannerStateDelta(current, delta));
  }, []);

  return (
    <AssistantRuntimeShell
      plannerState={plannerState}
      onCommittedImages={handleCommittedImages}
      onPlannerResponse={handlePlannerResponse}
      onPlannerStateDelta={handlePlannerStateDelta}
      onReasoning={handleReasoning}
    >
      <main className="min-h-screen px-4 py-4 text-white md:px-6 md:py-6">
        <div className="mx-auto grid max-w-[1680px] gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
          <MapStage
            initialCenter={
              plannerState.weather?.latitude != null &&
              plannerState.weather?.longitude != null
                ? {
                    lat: plannerState.weather.latitude,
                    lng: plannerState.weather.longitude,
                  }
                : undefined
            }
            plan={plannerState.plan}
            provisionalPoints={plannerState.provisionalMapPoints}
            mapHighlights={plannerState.mapHighlights}
            weather={plannerState.weather}
            images={plannerState.images}
            scenes={plannerState.scenes}
            reasoningText={reasoningText}
          />
          <ChatPanel images={plannerState.images} />
        </div>
      </main>
    </AssistantRuntimeShell>
  );
}
