from __future__ import annotations

from ..models import (
    DayPlan,
    IntakeField,
    IntakePreferences,
    ProvisionalMapPoint,
    SceneIntent,
    WeatherSnapshot,
)


def compute_pending_fields(
    preferences: IntakePreferences | None,
    scenes: list[SceneIntent] | None = None,
    current_plan: DayPlan | None = None,
    weather: WeatherSnapshot | None = None,
    explicit_pending_fields: list[IntakeField] | None = None,
) -> list[IntakeField]:
    scenes = scenes or []
    if preferences is None:
        base = [] if can_infer_planning_area(None, scenes, current_plan, weather) else ["city"]
        return explicit_pending_fields or base

    pending_fields: list[IntakeField] = []
    if not preferences.city and not can_infer_planning_area(
        preferences,
        scenes,
        current_plan,
        weather,
    ):
        pending_fields.append("city")

    if explicit_pending_fields:
        for field in explicit_pending_fields:
            if field in {"startArea", "startTime", "endArea", "endTime"}:
                continue
            if field not in pending_fields and _field_is_missing(
                preferences=preferences,
                field=field,
            ):
                pending_fields.append(field)

    return pending_fields


def detect_user_confirmation(message: str) -> bool:
    normalized = message.lower()
    affirmations = (
        "yes",
        "yep",
        "yeah",
        "correct",
        "that's right",
        "thats right",
        "exactly",
        "sounds right",
        "looks right",
    )
    return any(token in normalized for token in affirmations)


def needs_vibe_confirmation(
    *,
    message: str,
    has_images: bool,
    has_new_images: bool,
    current_plan_exists: bool,
    vibe_override_present: bool,
    vibe_requires_confirmation: bool,
) -> bool:
    if not has_images:
        return False
    if vibe_override_present:
        return False
    if detect_user_confirmation(message):
        return False
    return vibe_requires_confirmation


def build_provisional_map_points(
    scenes: list[SceneIntent],
    preferences: IntakePreferences | None,
) -> list[ProvisionalMapPoint]:
    points: list[ProvisionalMapPoint] = []

    for scene in scenes:
        if not scene.place_candidates:
            continue
        candidate = next(
            (
                item
                for item in scene.place_candidates
                if _has_valid_coordinates(item.lat, item.lng)
            ),
            None,
        )
        if candidate is None:
            continue
        points.append(
            ProvisionalMapPoint(
                id=f"candidate-{scene.image_id}",
                label=candidate.name,
                lat=candidate.lat,
                lng=candidate.lng,
                kind="candidate",
                color=_scene_color(scene.scene_type),
            )
        )

    return points


def can_infer_planning_area(
    preferences: IntakePreferences | None,
    scenes: list[SceneIntent],
    current_plan: DayPlan | None,
    weather: WeatherSnapshot | None,
) -> bool:
    if preferences and preferences.city:
        return True
    if weather and weather.latitude is not None and weather.longitude is not None:
        return True
    if current_plan and current_plan.stops:
        return True
    return infer_area_hint_from_scenes(scenes) is not None


def infer_area_hint_from_scenes(
    scenes: list[SceneIntent],
) -> tuple[str, float, float] | None:
    coordinates: list[tuple[float, float]] = []
    for scene in scenes:
        for candidate in scene.place_candidates:
            if _has_valid_coordinates(candidate.lat, candidate.lng):
                coordinates.append((candidate.lat, candidate.lng))

    if not coordinates:
        return None

    if len(coordinates) == 1:
        lat, lng = coordinates[0]
        return "Inferred route area", lat, lng

    avg_lat = sum(lat for lat, _ in coordinates) / len(coordinates)
    avg_lng = sum(lng for _, lng in coordinates) / len(coordinates)
    return "Inferred route area", round(avg_lat, 6), round(avg_lng, 6)


def next_question_for_field(field: IntakeField) -> str:
    return {
        "city": "Which city should I ground this route in?",
        "startArea": "Where should I begin the day?",
        "startTime": "What time do you want the day to start?",
        "endArea": "Where should the day wind down?",
        "endTime": "Do you have a latest end time I should protect?",
        "vibeOverride": "If the photo vibe is off, how should the day feel instead?",
    }[field]


def _scene_color(scene_type: str) -> str:
    return {
        "food": "#2563eb",
        "park": "#059669",
        "viewpoint": "#dc2626",
        "museum": "#7c3aed",
        "shopping": "#ea580c",
        "nightlife": "#be185d",
        "neighborhood": "#0891b2",
        "landmark": "#4f46e5",
        "other": "#6b7280",
    }.get(scene_type, "#6b7280")


def _field_is_missing(*, preferences: IntakePreferences, field: IntakeField) -> bool:
    return {
        "city": not preferences.city,
        "startArea": False,
        "startTime": False,
        "endArea": False,
        "endTime": False,
        "vibeOverride": not preferences.vibe_override,
    }[field]


def _has_valid_coordinates(lat: float | None, lng: float | None) -> bool:
    if lat is None or lng is None:
        return False
    return -90 <= lat <= 90 and -180 <= lng <= 180
