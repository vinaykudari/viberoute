import { z } from "zod";

export const SceneTypeSchema = z.enum([
  "landmark",
  "viewpoint",
  "food",
  "neighborhood",
  "museum",
  "park",
  "shopping",
  "nightlife",
  "other",
]);

export const TimePreferenceSchema = z.enum([
  "sunrise",
  "morning",
  "midday",
  "afternoon",
  "sunset",
  "evening",
  "night",
  "flexible",
]);

export const PlannerMessageRoleSchema = z.enum(["assistant", "user", "system"]);

export const LatLngSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const ImageUploadSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  previewUrl: z.string().nullish(),
});

export const PlaceCandidateSchema = z.object({
  name: z.string(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  address: z.string().nullish(),
  category: z.string().nullish(),
  source: z.enum(["gemini", "google-places", "manual", "geocoder"]),
  confidence: z.number().min(0).max(1),
});

export const SceneIntentSchema = z.object({
  imageId: z.string(),
  title: z.string(),
  sceneType: SceneTypeSchema,
  vibeTags: z.array(z.string()),
  timePreference: TimePreferenceSchema,
  durationMinutes: z.number().int().positive(),
  placeCandidates: z.array(PlaceCandidateSchema),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullish(),
});

export const PlannerMessageSchema = z.object({
  id: z.string(),
  role: PlannerMessageRoleSchema,
  content: z.string(),
  createdAtIso: z.string(),
});

export const PlannerChatImageSchema = z.object({
  dataUrl: z.string(),
  filename: z.string().nullish(),
  mimeType: z.string().nullish(),
});

export const InterpretedVibeSchema = z.object({
  summary: z.string(),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  outdoorBias: z.number().min(0).max(1),
  pace: z.enum(["relaxed", "balanced", "active"]),
  requiresConfirmation: z.boolean(),
});

export const WeatherHourSchema = z.object({
  timeIso: z.string(),
  condition: z.enum(["clear", "cloudy", "drizzle", "rain", "windy", "fog"]),
  temperatureC: z.number(),
  precipitationProbability: z.number().min(0).max(1),
  outdoorFriendly: z.boolean(),
});

export const WeatherSnapshotSchema = z.object({
  areaLabel: z.string(),
  dateIso: z.string(),
  summary: z.string(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  timezone: z.string().nullish(),
  sunriseTimeIso: z.string().nullish(),
  sunsetTimeIso: z.string().nullish(),
  hourly: z.array(WeatherHourSchema),
});

export const IntakePreferencesSchema = z.object({
  city: z.string().default(""),
  startArea: z.string().nullish(),
  startTime: z.string().nullish(),
  endArea: z.string().nullish(),
  endTime: z.string().nullish(),
  vibeOverride: z.string().nullish(),
  hardConstraints: z.array(z.string()).default([]),
});

export const IntakeFieldSchema = z.enum([
  "city",
  "startArea",
  "startTime",
  "endArea",
  "endTime",
  "vibeOverride",
]);

export const ProvisionalMapPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  kind: z.enum(["candidate", "start", "end", "stop"]),
  color: z.string(),
});

export const MapHighlightCardSchema = z.object({
  id: z.string(),
  sourceImageId: z.string(),
  title: z.string(),
  detail: z.string().nullish(),
  placeName: z.string(),
  timeLabel: z.string(),
  lat: z.number(),
  lng: z.number(),
  color: z.string(),
  timePreference: TimePreferenceSchema,
});

export const RouteSegmentSchema = z.object({
  id: z.string(),
  fromStopId: z.string(),
  toStopId: z.string(),
  routeColor: z.string(),
  mode: z.enum(["walk", "drive", "transit"]),
  durationMinutes: z.number().int().nonnegative(),
  path: z.array(LatLngSchema),
});

export const PlannedStopSchema = z.object({
  id: z.string(),
  title: z.string(),
  lat: z.number(),
  lng: z.number(),
  startTimeIso: z.string(),
  endTimeIso: z.string(),
  routeColor: z.string(),
  sourceImageIds: z.array(z.string()),
  rationale: z.string(),
  visitDurationMinutes: z.number().int().positive().nullish(),
  travelMinutesFromPrevious: z.number().int().nonnegative().nullish(),
  travelModeFromPrevious: z.enum(["walk", "drive", "transit"]).nullish(),
  estimatedSpendUsdMin: z.number().int().nonnegative().nullish(),
  estimatedSpendUsdMax: z.number().int().nonnegative().nullish(),
});

export const DayPlanSchema = z.object({
  city: z.string(),
  startLocation: z
    .object({
      label: z.string(),
      lat: z.number(),
      lng: z.number(),
    })
    .nullish(),
  endLocation: z
    .object({
      label: z.string(),
      lat: z.number(),
      lng: z.number(),
    })
    .nullish(),
  stops: z.array(PlannedStopSchema),
  segments: z.array(RouteSegmentSchema),
  summary: z.string(),
});

export const NavigationPoiSchema = z.object({
  id: z.string(),
  title: z.string(),
  placeName: z.string(),
  detail: z.string().nullish(),
  lat: z.number(),
  lng: z.number(),
  color: z.string(),
  etaLabel: z.string().nullish(),
});

export const AnalyzeImagesRequestSchema = z.object({
  city: z.string(),
  images: z.array(ImageUploadSchema).min(1).max(6),
});

export const AnalyzeImagesResponseSchema = z.object({
  scenes: z.array(SceneIntentSchema),
  followUpFields: z.array(IntakeFieldSchema),
});

export const GroundPlacesRequestSchema = z.object({
  city: z.string(),
  scenes: z.array(SceneIntentSchema),
});

export const GroundPlacesResponseSchema = z.object({
  scenes: z.array(SceneIntentSchema),
});

export const GeneratePlanRequestSchema = z.object({
  preferences: IntakePreferencesSchema,
  scenes: z.array(SceneIntentSchema).default([]),
});

export const GeneratePlanResponseSchema = z.object({
  plan: DayPlanSchema,
});

export const RevisePlanRequestSchema = z.object({
  plan: DayPlanSchema,
  message: z.string().min(1),
});

export const RevisePlanResponseSchema = z.object({
  plan: DayPlanSchema,
  agentReply: z.string(),
});

export const PlannerChatRequestSchema = z.object({
  message: z.string().default(""),
  images: z.array(PlannerChatImageSchema).max(6).default([]),
  newImages: z.array(PlannerChatImageSchema).max(6).default([]),
  preferences: IntakePreferencesSchema.nullish(),
  interpretedVibe: InterpretedVibeSchema.nullish(),
  scenes: z.array(SceneIntentSchema).default([]),
  plan: DayPlanSchema.nullish(),
  pendingFields: z.array(IntakeFieldSchema).default([]),
});

export const PlannerChatResponseSchema = z.object({
  agentReply: z.string(),
  pendingFields: z.array(IntakeFieldSchema),
  needsClarification: z.boolean(),
  routeAction: z.enum(["hold", "plan", "replan"]).default("hold"),
  stage: z
    .enum([
      "needs_input",
      "needs_confirmation",
      "ready_to_plan",
      "planned",
      "replanned",
    ])
    .default("needs_input"),
  interpretedVibe: InterpretedVibeSchema.nullish(),
  weather: WeatherSnapshotSchema.nullish(),
  scenes: z.array(SceneIntentSchema).default([]),
  provisionalMapPoints: z.array(ProvisionalMapPointSchema).default([]),
  mapHighlights: z.array(MapHighlightCardSchema).default([]),
  preferences: IntakePreferencesSchema.nullish(),
  plan: DayPlanSchema.nullish(),
});

export const PlannerChatStateDeltaSchema = z.object({
  preferences: IntakePreferencesSchema.nullish(),
  interpretedVibe: InterpretedVibeSchema.nullish(),
  weather: WeatherSnapshotSchema.nullish(),
  scenes: z.array(SceneIntentSchema).default([]),
  provisionalMapPoints: z.array(ProvisionalMapPointSchema).default([]),
  mapHighlights: z.array(MapHighlightCardSchema).default([]),
  plan: DayPlanSchema.nullish(),
});

export const PlannerChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reasoning"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("state"),
    state: PlannerChatStateDeltaSchema,
  }),
  z.object({
    type: z.literal("response"),
    response: PlannerChatResponseSchema,
  }),
  z.object({
    type: z.literal("error"),
    error: z.string(),
  }),
]);

export const ExportPlanRequestSchema = z.object({
  plan: DayPlanSchema,
});

export const NavigationCommentaryRequestSchema = z.object({
  city: z.string(),
  routeSummary: z.string(),
  progressPercent: z.number().min(0).max(100),
  travelMode: z.enum(["walk", "drive", "transit"]).nullish(),
  weatherSummary: z.string().nullish(),
  nextPoi: NavigationPoiSchema.nullish(),
  destination: NavigationPoiSchema,
  remainingPoiCount: z.number().int().nonnegative(),
  recentLines: z.array(z.string()).max(6).default([]),
});

export const NavigationCommentaryResponseSchema = z.object({
  commentary: z.string(),
  focus: z.enum(["poi", "destination"]),
  model: z.string(),
  usedLive: z.boolean(),
});

export type ImageUpload = z.infer<typeof ImageUploadSchema>;
export type PlaceCandidate = z.infer<typeof PlaceCandidateSchema>;
export type SceneIntent = z.infer<typeof SceneIntentSchema>;
export type PlannerMessage = z.infer<typeof PlannerMessageSchema>;
export type PlannerChatImage = z.infer<typeof PlannerChatImageSchema>;
export type InterpretedVibe = z.infer<typeof InterpretedVibeSchema>;
export type WeatherHour = z.infer<typeof WeatherHourSchema>;
export type WeatherSnapshot = z.infer<typeof WeatherSnapshotSchema>;
export type IntakePreferences = z.infer<typeof IntakePreferencesSchema>;
export type IntakeField = z.infer<typeof IntakeFieldSchema>;
export type ProvisionalMapPoint = z.infer<typeof ProvisionalMapPointSchema>;
export type MapHighlightCard = z.infer<typeof MapHighlightCardSchema>;
export type RouteSegment = z.infer<typeof RouteSegmentSchema>;
export type PlannedStop = z.infer<typeof PlannedStopSchema>;
export type DayPlan = z.infer<typeof DayPlanSchema>;
export type NavigationPoi = z.infer<typeof NavigationPoiSchema>;
export type AnalyzeImagesRequest = z.infer<typeof AnalyzeImagesRequestSchema>;
export type AnalyzeImagesResponse = z.infer<typeof AnalyzeImagesResponseSchema>;
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequestSchema>;
export type GeneratePlanResponse = z.infer<typeof GeneratePlanResponseSchema>;
export type RevisePlanRequest = z.infer<typeof RevisePlanRequestSchema>;
export type RevisePlanResponse = z.infer<typeof RevisePlanResponseSchema>;
export type PlannerChatRequest = z.infer<typeof PlannerChatRequestSchema>;
export type PlannerChatResponse = z.infer<typeof PlannerChatResponseSchema>;
export type PlannerChatStateDelta = z.infer<typeof PlannerChatStateDeltaSchema>;
export type PlannerChatStreamEvent = z.infer<typeof PlannerChatStreamEventSchema>;
export type NavigationCommentaryRequest = z.infer<
  typeof NavigationCommentaryRequestSchema
>;
export type NavigationCommentaryResponse = z.infer<
  typeof NavigationCommentaryResponseSchema
>;
