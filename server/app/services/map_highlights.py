from __future__ import annotations

import json
from datetime import datetime

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ..agents.shared import normalize_google_env
from ..env import get_preferred_env_value, get_preferred_google_api_key
from ..models import DayPlan, InterpretedVibe, MapHighlightCard, SceneIntent, WeatherSnapshot


class GeminiMapHighlightDraft(BaseModel):
    source_image_id: str = Field(alias="sourceImageId")
    title: str
    detail: str | None = None

    model_config = {"populate_by_name": True}


class GeminiMapHighlightResponse(BaseModel):
    cards: list[GeminiMapHighlightDraft]


class MapHighlightService:
    def __init__(self) -> None:
        normalize_google_env()
        self.api_key = get_preferred_google_api_key()
        self.model = get_preferred_env_value("VIBEROUTE_AGENT_MODEL") or (
            "gemini-3.1-flash-lite-preview"
        )
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None

    async def build_cards(
        self,
        *,
        scenes: list[SceneIntent],
        vibe: InterpretedVibe | None,
        weather: WeatherSnapshot | None,
        plan: DayPlan | None = None,
    ) -> list[MapHighlightCard]:
        if not self.client or not scenes:
            return []

        stop_by_image_id = _build_stop_lookup(plan)
        scene_rows = [
            _scene_context(
                scene,
                stop_by_image_id.get(scene.image_id),
                weather,
            )
            for scene in scenes
            if _resolve_anchor(scene, stop_by_image_id.get(scene.image_id))
        ]
        if not scene_rows:
            return []

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=_build_prompt(
                    scene_rows=scene_rows,
                    vibe=vibe,
                    weather=weather,
                    plan=plan,
                ),
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                    response_schema=GeminiMapHighlightResponse,
                ),
            )
            parsed = response.parsed
        except Exception:
            return []
        if parsed is None:
            return []

        scenes_by_id = {scene.image_id: scene for scene in scenes}
        seen_image_ids: set[str] = set()
        cards: list[MapHighlightCard] = []

        for draft in parsed.cards:
            if draft.source_image_id in seen_image_ids:
                continue

            scene = scenes_by_id.get(draft.source_image_id)
            if scene is None:
                continue

            stop = stop_by_image_id.get(draft.source_image_id)
            anchor = _resolve_anchor(scene, stop)
            if anchor is None:
                continue
            if not draft.title.strip():
                continue

            cards.append(
                MapHighlightCard(
                    id=f"highlight-{scene.image_id}",
                    sourceImageId=scene.image_id,
                    title=draft.title.strip(),
                    detail=draft.detail.strip() if draft.detail else None,
                    placeName=str(anchor["name"]),
                    timeLabel=_build_time_label(
                        scene=scene,
                        anchor=anchor,
                        weather=weather,
                    ),
                    lat=float(anchor["lat"]),
                    lng=float(anchor["lng"]),
                    color=stop.route_color if stop else _scene_color(scene.scene_type),
                    timePreference=scene.time_preference,
                )
            )
            seen_image_ids.add(draft.source_image_id)

        return cards


def get_map_highlight_service() -> MapHighlightService:
    return MapHighlightService()


def _build_prompt(
    *,
    scene_rows: list[dict[str, object]],
    vibe: InterpretedVibe | None,
    weather: WeatherSnapshot | None,
    plan: DayPlan | None,
) -> str:
    return (
        "You write bottom-of-map highlight cards for a one-day route planner.\n"
        "Return exactly one card for each scene in the input JSON.\n"
        "Use the exact sourceImageId values from the input.\n"
        "Titles should feel like natural invitations tied to the place, image mood, and best light.\n"
        "Tone example only: Enjoy sunrise at Hawk Hill. Settle into stargazing at Lick Observatory.\n"
        "Keep each title under 12 words.\n"
        "Keep each detail to one short sentence under 16 words.\n"
        "Use the detail to explain the timing or weather logic when it matters.\n"
        "Use the sceneTitle, vibeTags, notes, timePreference, and weather to infer why this stop is best at that moment.\n"
        "If the image reads as sunset, golden hour, twilight, blue hour, or sunrise, align the writing to the actual sunrise or sunset time instead of generic evening language.\n"
        "If the plan already gives a routed visit window, keep the copy aligned with that window.\n"
        "Use specific place-aware language. Do not invent places.\n"
        "If a scene points to sunrise or sunset, lean into that in the title.\n"
        f"Vibe summary: {vibe.summary if vibe else 'None'}\n"
        f"Weather summary: {weather.summary if weather else 'None'}\n"
        f"Sunrise time: {weather.sunrise_time_iso if weather else 'None'}\n"
        f"Sunset time: {weather.sunset_time_iso if weather else 'None'}\n"
        f"Plan summary: {plan.summary if plan else 'None'}\n"
        "Scene JSON:\n"
        f"{json.dumps(scene_rows, ensure_ascii=True)}"
    )


def _scene_context(
    scene: SceneIntent,
    stop,
    weather: WeatherSnapshot | None,
) -> dict[str, object]:
    anchor = _resolve_anchor(scene, stop)
    return {
        "sourceImageId": scene.image_id,
        "sceneTitle": scene.title,
        "sceneType": scene.scene_type,
        "timePreference": scene.time_preference,
        "vibeTags": scene.vibe_tags[:5],
        "placeName": anchor["name"] if anchor else None,
        "address": anchor.get("address") if anchor else None,
        "timeLabel": (
            _build_time_label(
                scene=scene,
                anchor=anchor,
                weather=weather,
            )
            if anchor
            else None
        ),
        "startTimeIso": anchor.get("startTimeIso") if anchor else None,
        "endTimeIso": anchor.get("endTimeIso") if anchor else None,
        "notes": scene.notes,
    }


def _build_stop_lookup(plan: DayPlan | None) -> dict[str, object]:
    if plan is None:
        return {}

    stop_by_image_id: dict[str, object] = {}
    for stop in plan.stops:
        for image_id in stop.source_image_ids:
            stop_by_image_id.setdefault(image_id, stop)

    return stop_by_image_id


def _resolve_anchor(scene: SceneIntent, stop):
    if stop is not None:
        return {
            "name": stop.title,
            "lat": stop.lat,
            "lng": stop.lng,
            "address": None,
            "startTimeIso": stop.start_time_iso,
            "endTimeIso": stop.end_time_iso,
        }

    anchor = _select_anchor(scene)
    if anchor is None or anchor.lat is None or anchor.lng is None:
        return None

    return {
        "name": anchor.name,
        "lat": anchor.lat,
        "lng": anchor.lng,
        "address": anchor.address,
        "startTimeIso": None,
        "endTimeIso": None,
    }


def _select_anchor(scene: SceneIntent):
    return next(
        (
            candidate
            for candidate in scene.place_candidates
            if candidate.lat is not None and candidate.lng is not None
        ),
        None,
    )


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


def _build_time_label(
    *,
    scene: SceneIntent,
    anchor: dict[str, object],
    weather: WeatherSnapshot | None,
) -> str:
    if scene.time_preference == "sunrise":
        sunrise_time = weather.sunrise_time_iso if weather else None
        if isinstance(sunrise_time, str):
            formatted = _format_local_time(sunrise_time)
            if formatted:
                return formatted

    if scene.time_preference == "sunset":
        sunset_time = weather.sunset_time_iso if weather else None
        if isinstance(sunset_time, str):
            formatted = _format_local_time(sunset_time)
            if formatted:
                return formatted

    start_time_iso = anchor.get("startTimeIso")
    if isinstance(start_time_iso, str):
        formatted = _format_local_time(start_time_iso)
        if formatted:
            return formatted

    return {
        "sunrise": "Sunrise",
        "morning": "Morning",
        "midday": "Midday",
        "afternoon": "Afternoon",
        "sunset": "Sunset",
        "evening": "Evening",
        "night": "Night",
        "flexible": "Flexible",
    }[scene.time_preference]


def _format_local_time(value: str) -> str | None:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None

    return parsed.strftime("%-I:%M %p")
