from __future__ import annotations

import logging

from google import genai
from google.genai import types

from ..env import get_preferred_env_value, get_preferred_google_api_key
from ..models import NavigationCommentaryRequest, NavigationCommentaryResponse

logger = logging.getLogger(__name__)


class NavigationCommentaryService:
    def __init__(self) -> None:
        self.api_key = get_preferred_google_api_key()
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.live_model = (
            get_preferred_env_value("VIBEROUTE_LIVE_MODEL")
            or "gemini-3.1-flash-live-preview"
        )
        self.fallback_model = (
            get_preferred_env_value("VIBEROUTE_NAV_FALLBACK_MODEL")
            or get_preferred_env_value("VIBEROUTE_MODEL")
            or "gemini-3.1-flash-lite-preview"
        )

    async def generate(
        self, payload: NavigationCommentaryRequest
    ) -> NavigationCommentaryResponse:
        if not self.client:
            raise RuntimeError(
                "Navigation commentary is unavailable because no Gemini API key is configured."
            )

        prompt = _build_commentary_prompt(payload)
        live_error: Exception | None = None

        try:
            live_text = await self._generate_with_live(prompt)
            if live_text:
                return NavigationCommentaryResponse(
                    commentary=live_text,
                    focus="poi" if payload.next_poi else "destination",
                    model=self.live_model,
                    usedLive=True,
                )
        except Exception as exc:  # pragma: no cover - external service instability
            live_error = exc
            logger.warning("Gemini Live commentary fallback: %s", exc)

        fallback_text = await self._generate_with_fallback(prompt)
        if not fallback_text and live_error is not None:
            raise RuntimeError(
                "Navigation commentary failed in both live and fallback modes."
            ) from live_error

        return NavigationCommentaryResponse(
            commentary=fallback_text or _fallback_copy(payload),
            focus="poi" if payload.next_poi else "destination",
            model=self.fallback_model,
            usedLive=False,
        )

    async def _generate_with_live(self, prompt: str) -> str:
        chunks: list[str] = []
        async with self.client.aio.live.connect(
            model=self.live_model,
            config=types.LiveConnectConfig(response_modalities=["TEXT"]),
        ) as session:
            await session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part(text=prompt)],
                ),
                turn_complete=True,
            )
            async for message in session.receive():
                if message.text:
                    chunks.append(message.text)
                if message.server_content and message.server_content.turn_complete:
                    break

        return _normalize_commentary("".join(chunks))

    async def _generate_with_fallback(self, prompt: str) -> str:
        response = await self.client.aio.models.generate_content(
            model=self.fallback_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.8,
                top_p=0.9,
            ),
        )
        return _normalize_commentary(response.text)


def get_navigation_commentary_service() -> NavigationCommentaryService:
    return NavigationCommentaryService()


def _build_commentary_prompt(payload: NavigationCommentaryRequest) -> str:
    focus = payload.next_poi or payload.destination
    focus_kind = "next point of interest" if payload.next_poi else "destination"
    travel_mode = payload.travel_mode or "drive"
    recent_lines = "\n".join(f"- {line}" for line in payload.recent_lines if line.strip())

    return f"""
You are VibeRoute's spoken story guide for a live navigation tour.

Write exactly one short spoken story beat. Keep it natural, vivid, and useful.
Rules:
- 1 to 2 sentences total.
- Maximum 48 words.
- No bullet points.
- Do not say you are an AI.
- Do not narrate GPS instructions.
- Make it feel like the next line in a flowing guided tour, not a disconnected fact.
- If there is a next point of interest, focus on why it is visually or culturally interesting.
- If there is no next point of interest, make the destination feel like the finale and include one memorable fact.
- Mention one concrete sensory or visual detail when possible.
- Avoid repeating any recent phrasing.

Trip context:
- City: {payload.city}
- Route summary: {payload.route_summary}
- Progress: {payload.progress_percent:.0f}%
- Travel mode: {travel_mode}
- Weather: {payload.weather_summary or "not specified"}
- Remaining POIs after this: {payload.remaining_poi_count}

Current focus ({focus_kind}):
- Title: {focus.title}
- Place name: {focus.place_name}
- Detail: {focus.detail or "no extra detail"}
- ETA label: {focus.eta_label or "soon"}

Recent commentary to avoid repeating:
{recent_lines or "- none"}
""".strip()


def _normalize_commentary(text: str | None) -> str:
    if not text:
        return ""

    normalized = " ".join(segment.strip() for segment in text.splitlines() if segment.strip())
    return normalized[:240].strip()


def _fallback_copy(payload: NavigationCommentaryRequest) -> str:
    focus = payload.next_poi or payload.destination
    eta = focus.eta_label or "coming up"
    if payload.next_poi:
        return (
            f"{focus.title} is {eta}. Keep an eye out for {focus.place_name}, "
            f"it is one of the strongest stops on this route."
        )

    return (
        f"You are closing in on {focus.place_name}. It is the final anchor for this route, "
        "so this is the moment to take in the setting before you arrive."
    )
