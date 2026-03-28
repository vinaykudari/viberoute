from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import Awaitable, Callable
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ..agents.shared import mark_llm_unavailable, normalize_google_env
from ..env import get_preferred_env_value, get_preferred_google_api_key
from ..models import InterpretedVibe, IntakePreferences, PlannerChatImage, SceneIntent
from ..planning.models import ImageInterpretationResult

SceneProgressEmitter = Callable[[list[SceneIntent]], Awaitable[None]]


class GeminiPlaceCandidate(BaseModel):
    name: str
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    category: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)


class GeminiSceneExtraction(BaseModel):
    title: str
    scene_type: Literal[
        "landmark",
        "viewpoint",
        "food",
        "neighborhood",
        "museum",
        "park",
        "shopping",
        "nightlife",
        "other",
    ] = Field(alias="sceneType")
    vibe_tags: list[str] = Field(alias="vibeTags")
    time_preference: Literal[
        "sunrise",
        "morning",
        "midday",
        "afternoon",
        "sunset",
        "evening",
        "night",
        "flexible",
    ] = Field(alias="timePreference")
    duration_minutes: int = Field(alias="durationMinutes")
    confidence: float = Field(ge=0.0, le=1.0)
    notes: str | None = None
    place_candidates: list[GeminiPlaceCandidate] = Field(
        default_factory=list,
        alias="placeCandidates",
    )

    model_config = {"populate_by_name": True}


class GeminiVibeInterpretation(BaseModel):
    summary: str
    tags: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    outdoor_bias: float = Field(alias="outdoorBias", ge=0.0, le=1.0)
    pace: Literal["relaxed", "balanced", "active"]

    model_config = {"populate_by_name": True}


class GeminiImageInterpreter:
    def __init__(self) -> None:
        normalize_google_env()
        self.api_key = get_preferred_google_api_key()
        self.model = get_preferred_env_value("VIBEROUTE_VISION_MODEL") or (
            "gemini-3.1-flash-lite-preview"
        )
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None

    async def interpret(
        self,
        *,
        message: str,
        images: list[PlannerChatImage],
        preferences: IntakePreferences | None,
        emit_scenes: SceneProgressEmitter | None = None,
    ) -> ImageInterpretationResult:
        if not images:
            return ImageInterpretationResult()

        if not self.client:
            mark_llm_unavailable()
            return ImageInterpretationResult(
                errorMessage=(
                    "Gemini image analysis is unavailable because no valid "
                    "`GEMINI_API_KEY` or `GOOGLE_API_KEY` is configured on the server."
                )
            )

        try:
            scenes = await self._request_scenes_in_parallel(
                message=message,
                images=images,
                preferences=preferences,
                emit_scenes=emit_scenes,
            )
            parsed_vibe = await self._request_vibe_interpretation(
                message=message,
                preferences=preferences,
                scenes=scenes,
            )

            return ImageInterpretationResult(
                scenes=scenes,
                interpretedVibe=InterpretedVibe(
                    summary=parsed_vibe.summary,
                    tags=parsed_vibe.tags[:6],
                    confidence=max(0.0, min(parsed_vibe.confidence, 1.0)),
                    outdoorBias=max(0.0, min(parsed_vibe.outdoor_bias, 1.0)),
                    pace=parsed_vibe.pace,
                    requiresConfirmation=_requires_confirmation(parsed_vibe, scenes),
                ),
            )
        except Exception as exc:
            mark_llm_unavailable()
            return ImageInterpretationResult(errorMessage=_build_error_message(exc))

    async def _request_scenes_in_parallel(
        self,
        *,
        message: str,
        images: list[PlannerChatImage],
        preferences: IntakePreferences | None,
        emit_scenes: SceneProgressEmitter | None,
    ) -> list[SceneIntent]:
        limited_images = images[:6]
        tasks = [
            asyncio.create_task(
                self._request_scene_for_image(
                    message=message,
                    image=image,
                    preferences=preferences,
                    index=index,
                )
            )
            for index, image in enumerate(limited_images)
        ]
        scenes_by_index: list[SceneIntent | None] = [None] * len(limited_images)
        try:
            for completed in asyncio.as_completed(tasks):
                index, scene = await completed
                scenes_by_index[index] = scene
                if emit_scenes is not None:
                    partial_scenes = [item for item in scenes_by_index if item is not None]
                    await emit_scenes(partial_scenes)
        except Exception:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

        if any(scene is None for scene in scenes_by_index):
            raise ValueError(
                "Gemini returned a scene count that did not match the uploaded images"
            )

        return [scene for scene in scenes_by_index if scene is not None]

    async def _request_scene_for_image(
        self,
        *,
        message: str,
        image: PlannerChatImage,
        preferences: IntakePreferences | None,
        index: int,
    ) -> tuple[int, SceneIntent]:
        prompt = _build_scene_prompt(
            message=message,
            preferences=preferences,
            image_label=image.filename or f"image {index + 1}",
        )
        data, mime_type = _decode_data_url(image.data_url, image.mime_type)
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=prompt),
                        types.Part.from_bytes(data=data, mime_type=mime_type),
                    ],
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=GeminiSceneExtraction,
            ),
        )
        parsed = response.parsed
        if parsed is None:
            raise ValueError("Gemini returned no parsed response")
        if not _scene_has_coordinates(parsed):
            raise ValueError("Gemini did not return coordinates for every uploaded image")
        return index, _build_scene(image=image, scene=parsed, index=index)

    async def _request_vibe_interpretation(
        self,
        *,
        message: str,
        preferences: IntakePreferences | None,
        scenes: list[SceneIntent],
    ) -> GeminiVibeInterpretation:
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=_build_vibe_prompt(
                message=message,
                preferences=preferences,
                scenes=scenes,
            ),
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=GeminiVibeInterpretation,
            ),
        )
        parsed = response.parsed
        if parsed is None:
            raise ValueError("Gemini returned no parsed response")
        return parsed


def get_image_interpreter() -> GeminiImageInterpreter:
    return GeminiImageInterpreter()


def _build_scene(
    *,
    image: PlannerChatImage,
    scene: GeminiSceneExtraction,
    index: int,
) -> SceneIntent:
    return SceneIntent(
        imageId=image.filename or f"image-{index + 1}",
        title=scene.title,
        sceneType=scene.scene_type,
        vibeTags=scene.vibe_tags[:6],
        timePreference=scene.time_preference,
        durationMinutes=max(30, min(scene.duration_minutes, 180)),
        confidence=max(0.0, min(scene.confidence, 1.0)),
        notes=scene.notes,
        placeCandidates=[
            {
                "name": candidate.name,
                "lat": _normalize_lat(candidate.lat),
                "lng": _normalize_lng(candidate.lng),
                "address": candidate.address,
                "category": candidate.category or scene.scene_type,
                "source": "gemini",
                "confidence": max(0.25, min(candidate.confidence, 0.98)),
            }
            for candidate in scene.place_candidates[:3]
        ],
    )


def _decode_data_url(data_url: str, mime_type: str | None) -> tuple[bytes, str]:
    if data_url.startswith("data:") and ";base64," in data_url:
        header, encoded = data_url.split(";base64,", 1)
        detected_mime = header.removeprefix("data:")
        return base64.b64decode(encoded), detected_mime

    return base64.b64decode(data_url), mime_type or "image/jpeg"


def _normalize_lat(value: float | None) -> float | None:
    if value is None or value < -90 or value > 90:
        return None
    return round(value, 6)


def _normalize_lng(value: float | None) -> float | None:
    if value is None or value < -180 or value > 180:
        return None
    return round(value, 6)


def _build_error_message(exc: Exception) -> str:
    details = str(exc)
    normalized = details.lower()

    if "api key expired" in normalized or "api_key_invalid" in normalized:
        return (
            "Gemini image analysis is unavailable because the configured API key is "
            "invalid or expired. Update `GEMINI_API_KEY` or `GOOGLE_API_KEY` in the "
            "server environment and try the upload again."
        )

    if "429" in normalized or "resource_exhausted" in normalized:
        return (
            "Gemini image analysis is temporarily rate-limited. Wait a moment and try "
            "the upload again."
        )

    if "scene count" in normalized:
        return (
            "Gemini returned an incomplete photo read. Try the upload again so I can "
            "match every image before routing the day."
        )

    if "coordinates for every uploaded image" in normalized:
        return (
            "Gemini could not pin every uploaded image to coordinates. Try another upload "
            "or add a short hint in chat so I can ground the route cleanly."
        )

    return (
        "Gemini image analysis failed before the planner could read the uploaded "
        "photos. Check the server logs and try the upload again."
    )


def _requires_confirmation(
    parsed: GeminiVibeInterpretation,
    scenes: list[SceneIntent],
) -> bool:
    if parsed.confidence < 0.72:
        return True

    if any(scene.confidence < 0.58 for scene in scenes):
        return True

    return False


def _scene_has_coordinates(scene: GeminiSceneExtraction) -> bool:
    if not scene.place_candidates:
        return False
    return any(
        _normalize_lat(candidate.lat) is not None
        and _normalize_lng(candidate.lng) is not None
        for candidate in scene.place_candidates
    )


def _build_scene_prompt(
    *,
    message: str,
    preferences: IntakePreferences | None,
    image_label: str,
) -> str:
    return (
        "You are analyzing one inspiration photo for a one-day city itinerary.\n"
        "Return exactly one structured scene extraction for this image.\n"
        "Include 1 to 3 real place candidates that match the image.\n"
        "Include at least one place candidate with both latitude and longitude.\n"
        "Do not leave coordinates blank.\n"
        "If the exact place is unclear, choose the best matching neighborhood, park, landmark, or venue and still include approximate coordinates.\n"
        f"Image label: {image_label}\n"
        f"User message: {message}\n"
        f"Target city: {preferences.city if preferences and preferences.city else 'unknown'}\n"
        "Return only valid JSON matching the schema."
    )


def _build_vibe_prompt(
    *,
    message: str,
    preferences: IntakePreferences | None,
    scenes: list[SceneIntent],
) -> list[types.Content]:
    scene_payload = [
        {
            "title": scene.title,
            "sceneType": scene.scene_type,
            "vibeTags": scene.vibe_tags,
            "timePreference": scene.time_preference,
            "confidence": scene.confidence,
            "placeCandidates": [
                {
                    "name": candidate.name,
                    "lat": candidate.lat,
                    "lng": candidate.lng,
                }
                for candidate in scene.place_candidates[:2]
            ],
        }
        for scene in scenes
    ]
    prompt = (
        "You are summarizing a one-day itinerary vibe from already-extracted photo scenes.\n"
        "Return only the overall vibe interpretation.\n"
        f"User message: {message}\n"
        f"Target city: {preferences.city if preferences and preferences.city else 'unknown'}\n"
        f"Scene data: {json.dumps(scene_payload)}"
    )
    return [types.Content(role="user", parts=[types.Part.from_text(text=prompt)])]
