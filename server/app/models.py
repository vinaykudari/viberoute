from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


SceneType = Literal[
    "landmark",
    "viewpoint",
    "food",
    "neighborhood",
    "museum",
    "park",
    "shopping",
    "nightlife",
    "other",
]

TimePreference = Literal[
    "sunrise",
    "morning",
    "midday",
    "afternoon",
    "sunset",
    "evening",
    "night",
    "flexible",
]

MessageRole = Literal["assistant", "user", "system"]
IntakeField = Literal[
    "city",
    "startArea",
    "startTime",
    "endArea",
    "endTime",
    "vibeOverride",
]
PointKind = Literal["candidate", "start", "end", "stop"]
RouteMode = Literal["walk", "drive", "transit"]
PlaceSource = Literal["gemini", "google-places", "manual", "geocoder"]


class LatLng(BaseModel):
    lat: float
    lng: float


class ImageUpload(BaseModel):
    id: str
    name: str
    mime_type: str = Field(alias="mimeType")
    preview_url: str | None = Field(default=None, alias="previewUrl")

    model_config = {"populate_by_name": True}


class PlaceCandidate(BaseModel):
    name: str
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    category: str | None = None
    source: PlaceSource
    confidence: float = Field(ge=0.0, le=1.0)


class SceneIntent(BaseModel):
    image_id: str = Field(alias="imageId")
    title: str
    scene_type: SceneType = Field(alias="sceneType")
    vibe_tags: list[str] = Field(alias="vibeTags")
    time_preference: TimePreference = Field(alias="timePreference")
    duration_minutes: int = Field(alias="durationMinutes", gt=0)
    place_candidates: list[PlaceCandidate] = Field(alias="placeCandidates")
    confidence: float = Field(ge=0.0, le=1.0)
    notes: str | None = None

    model_config = {"populate_by_name": True}


class PlannerMessage(BaseModel):
    id: str
    role: MessageRole
    content: str
    created_at_iso: str = Field(alias="createdAtIso")

    model_config = {"populate_by_name": True}


class PlannerChatImage(BaseModel):
    data_url: str = Field(alias="dataUrl")
    filename: str | None = None
    mime_type: str | None = Field(default=None, alias="mimeType")

    model_config = {"populate_by_name": True}


class InterpretedVibe(BaseModel):
    summary: str
    tags: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    outdoor_bias: float = Field(alias="outdoorBias", ge=0.0, le=1.0)
    pace: Literal["relaxed", "balanced", "active"]
    requires_confirmation: bool = Field(alias="requiresConfirmation")

    model_config = {"populate_by_name": True}


class WeatherHour(BaseModel):
    time_iso: str = Field(alias="timeIso")
    condition: Literal["clear", "cloudy", "drizzle", "rain", "windy", "fog"]
    temperature_c: float = Field(alias="temperatureC")
    precipitation_probability: float = Field(
        alias="precipitationProbability", ge=0.0, le=1.0
    )
    outdoor_friendly: bool = Field(alias="outdoorFriendly")

    model_config = {"populate_by_name": True}


class WeatherSnapshot(BaseModel):
    area_label: str = Field(alias="areaLabel")
    date_iso: str = Field(alias="dateIso")
    summary: str
    latitude: float | None = None
    longitude: float | None = None
    timezone: str | None = None
    sunrise_time_iso: str | None = Field(default=None, alias="sunriseTimeIso")
    sunset_time_iso: str | None = Field(default=None, alias="sunsetTimeIso")
    hourly: list[WeatherHour]

    model_config = {"populate_by_name": True}


class IntakePreferences(BaseModel):
    city: str = ""
    start_area: str | None = Field(default=None, alias="startArea")
    start_time: str | None = Field(default=None, alias="startTime")
    end_area: str | None = Field(default=None, alias="endArea")
    end_time: str | None = Field(default=None, alias="endTime")
    vibe_override: str | None = Field(default=None, alias="vibeOverride")
    hard_constraints: list[str] = Field(default_factory=list, alias="hardConstraints")

    model_config = {"populate_by_name": True}


class ProvisionalMapPoint(BaseModel):
    id: str
    label: str
    lat: float
    lng: float
    kind: PointKind
    color: str


class MapHighlightCard(BaseModel):
    id: str
    source_image_id: str = Field(alias="sourceImageId")
    title: str
    detail: str | None = None
    place_name: str = Field(alias="placeName")
    time_label: str = Field(alias="timeLabel")
    lat: float
    lng: float
    color: str
    time_preference: TimePreference = Field(alias="timePreference")

    model_config = {"populate_by_name": True}


class RouteSegment(BaseModel):
    id: str
    from_stop_id: str = Field(alias="fromStopId")
    to_stop_id: str = Field(alias="toStopId")
    route_color: str = Field(alias="routeColor")
    mode: RouteMode
    duration_minutes: int = Field(alias="durationMinutes", ge=0)
    path: list[LatLng]

    model_config = {"populate_by_name": True}


class PlannedStop(BaseModel):
    id: str
    title: str
    lat: float
    lng: float
    start_time_iso: str = Field(alias="startTimeIso")
    end_time_iso: str = Field(alias="endTimeIso")
    route_color: str = Field(alias="routeColor")
    source_image_ids: list[str] = Field(alias="sourceImageIds")
    rationale: str
    visit_duration_minutes: int | None = Field(
        default=None, alias="visitDurationMinutes", gt=0
    )
    travel_minutes_from_previous: int | None = Field(
        default=None, alias="travelMinutesFromPrevious", ge=0
    )
    travel_mode_from_previous: RouteMode | None = Field(
        default=None, alias="travelModeFromPrevious"
    )
    estimated_spend_usd_min: int | None = Field(
        default=None, alias="estimatedSpendUsdMin", ge=0
    )
    estimated_spend_usd_max: int | None = Field(
        default=None, alias="estimatedSpendUsdMax", ge=0
    )

    model_config = {"populate_by_name": True}


class PlanLocation(BaseModel):
    label: str
    lat: float
    lng: float


class DayPlan(BaseModel):
    city: str
    start_location: PlanLocation | None = Field(default=None, alias="startLocation")
    end_location: PlanLocation | None = Field(default=None, alias="endLocation")
    stops: list[PlannedStop]
    segments: list[RouteSegment]
    summary: str

    model_config = {"populate_by_name": True}


class NavigationPoi(BaseModel):
    id: str
    title: str
    place_name: str = Field(alias="placeName")
    detail: str | None = None
    lat: float
    lng: float
    color: str
    eta_label: str | None = Field(default=None, alias="etaLabel")

    model_config = {"populate_by_name": True}


class AnalyzeImagesRequest(BaseModel):
    city: str
    images: list[ImageUpload] = Field(min_length=1, max_length=6)


class AnalyzeImagesResponse(BaseModel):
    scenes: list[SceneIntent]
    follow_up_fields: list[IntakeField] = Field(alias="followUpFields")

    model_config = {"populate_by_name": True}


class GroundPlacesRequest(BaseModel):
    city: str
    scenes: list[SceneIntent]


class GroundPlacesResponse(BaseModel):
    scenes: list[SceneIntent]


class GeneratePlanRequest(BaseModel):
    preferences: IntakePreferences
    scenes: list[SceneIntent] = Field(default_factory=list)


class GeneratePlanResponse(BaseModel):
    plan: DayPlan


class RevisePlanRequest(BaseModel):
    plan: DayPlan
    message: str = Field(min_length=1)


class RevisePlanResponse(BaseModel):
    plan: DayPlan
    agent_reply: str = Field(alias="agentReply")

    model_config = {"populate_by_name": True}


class PlannerChatRequest(BaseModel):
    message: str = Field(default="")
    images: list[PlannerChatImage] = Field(default_factory=list)
    new_images: list[PlannerChatImage] = Field(default_factory=list, alias="newImages")
    preferences: IntakePreferences | None = None
    interpreted_vibe: InterpretedVibe | None = Field(
        default=None, alias="interpretedVibe"
    )
    scenes: list[SceneIntent] = Field(default_factory=list)
    plan: DayPlan | None = None
    pending_fields: list[IntakeField] = Field(default_factory=list, alias="pendingFields")

    model_config = {"populate_by_name": True}


class PlannerChatResponse(BaseModel):
    agent_reply: str = Field(alias="agentReply")
    pending_fields: list[IntakeField] = Field(alias="pendingFields")
    needs_clarification: bool = Field(alias="needsClarification")
    route_action: Literal["hold", "plan", "replan"] = Field(
        default="hold", alias="routeAction"
    )
    stage: Literal[
        "needs_input",
        "needs_confirmation",
        "ready_to_plan",
        "planned",
        "replanned",
    ] = "needs_input"
    interpreted_vibe: InterpretedVibe | None = Field(
        default=None, alias="interpretedVibe"
    )
    weather: WeatherSnapshot | None = None
    scenes: list[SceneIntent] = Field(default_factory=list)
    provisional_map_points: list[ProvisionalMapPoint] = Field(
        default_factory=list, alias="provisionalMapPoints"
    )
    map_highlights: list[MapHighlightCard] = Field(
        default_factory=list, alias="mapHighlights"
    )
    preferences: IntakePreferences | None = None
    plan: DayPlan | None = None

    model_config = {"populate_by_name": True}


class PlannerChatStateDelta(BaseModel):
    preferences: IntakePreferences | None = None
    interpreted_vibe: InterpretedVibe | None = Field(
        default=None, alias="interpretedVibe"
    )
    weather: WeatherSnapshot | None = None
    scenes: list[SceneIntent] = Field(default_factory=list)
    provisional_map_points: list[ProvisionalMapPoint] = Field(
        default_factory=list, alias="provisionalMapPoints"
    )
    map_highlights: list[MapHighlightCard] = Field(
        default_factory=list, alias="mapHighlights"
    )
    plan: DayPlan | None = None

    model_config = {"populate_by_name": True}


class ExportPlanRequest(BaseModel):
    plan: DayPlan


class NavigationCommentaryRequest(BaseModel):
    city: str
    route_summary: str = Field(alias="routeSummary")
    progress_percent: float = Field(alias="progressPercent", ge=0.0, le=100.0)
    travel_mode: RouteMode | None = Field(default=None, alias="travelMode")
    weather_summary: str | None = Field(default=None, alias="weatherSummary")
    next_poi: NavigationPoi | None = Field(default=None, alias="nextPoi")
    destination: NavigationPoi
    remaining_poi_count: int = Field(alias="remainingPoiCount", ge=0)
    recent_lines: list[str] = Field(default_factory=list, alias="recentLines")

    model_config = {"populate_by_name": True}


class NavigationCommentaryResponse(BaseModel):
    commentary: str
    focus: Literal["poi", "destination"]
    model: str
    used_live: bool = Field(alias="usedLive")

    model_config = {"populate_by_name": True}
