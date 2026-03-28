import type {
  DayPlan,
  IntakeField,
  IntakePreferences,
  InterpretedVibe,
  MapHighlightCard,
  PlannerChatImage,
  PlannerChatResponse,
  PlannerChatStateDelta,
  ProvisionalMapPoint,
  SceneIntent,
  WeatherSnapshot,
} from "@viberoute/shared";

export type PlannerUiState = {
  images: PlannerChatImage[];
  pendingFields: IntakeField[];
  preferences: IntakePreferences;
  interpretedVibe?: InterpretedVibe;
  weather?: WeatherSnapshot;
  scenes: SceneIntent[];
  provisionalMapPoints: ProvisionalMapPoint[];
  mapHighlights: MapHighlightCard[];
  plan?: DayPlan;
};

export const initialPlannerState: PlannerUiState = {
  images: [],
  pendingFields: [],
  preferences: {
    city: "",
    hardConstraints: [],
  },
  scenes: [],
  provisionalMapPoints: [],
  mapHighlights: [],
};

export function mergePlannerState(
  current: PlannerUiState,
  response: PlannerChatResponse,
  images: PlannerChatImage[],
): PlannerUiState {
  return {
    images,
    pendingFields: response.pendingFields,
    preferences: response.preferences ?? current.preferences,
    interpretedVibe: response.interpretedVibe ?? current.interpretedVibe,
    weather: response.weather ?? current.weather,
    scenes: response.scenes.length ? response.scenes : current.scenes,
    provisionalMapPoints:
      response.provisionalMapPoints.length > 0
        ? response.provisionalMapPoints
        : current.provisionalMapPoints,
    mapHighlights:
      response.mapHighlights.length > 0 || response.scenes.length > 0
        ? response.mapHighlights
        : current.mapHighlights,
    plan: response.plan ?? current.plan,
  };
}

export function mergePlannerStateDelta(
  current: PlannerUiState,
  delta: PlannerChatStateDelta,
): PlannerUiState {
  return {
    ...current,
    preferences: delta.preferences ?? current.preferences,
    interpretedVibe: delta.interpretedVibe ?? current.interpretedVibe,
    weather: delta.weather ?? current.weather,
    scenes: delta.scenes.length ? delta.scenes : current.scenes,
    provisionalMapPoints:
      delta.provisionalMapPoints.length > 0
        ? delta.provisionalMapPoints
        : current.provisionalMapPoints,
    mapHighlights:
      delta.mapHighlights.length > 0 || delta.scenes.length > 0
        ? delta.mapHighlights
        : current.mapHighlights,
    plan: delta.plan ?? current.plan,
  };
}
