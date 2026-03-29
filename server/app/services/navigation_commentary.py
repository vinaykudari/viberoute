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
    focus = payload.current_poi or payload.next_poi or payload.destination
    if payload.current_poi:
        focus_kind = "current point of interest"
    elif payload.next_poi:
        focus_kind = "next point of interest"
    else:
        focus_kind = "destination"
    travel_mode = payload.travel_mode or "drive"
    recent_lines = "\n".join(f"- {line}" for line in payload.recent_lines if line.strip())
    current_time = payload.current_time_label or "right now"
    focus_eta = focus.eta_label or "soon"
    minutes_until_focus = (
        str(payload.minutes_until_focus)
        if payload.minutes_until_focus is not None
        else "unknown"
    )
    minutes_until_destination = (
        str(payload.minutes_until_destination)
        if payload.minutes_until_destination is not None
        else "unknown"
    )

    return f"""
You are VibeRoute's spoken story guide for a live navigation tour.

Write exactly one short spoken story beat. Keep it natural, vivid, and useful.
Rules:
- 1 to 2 sentences total.
- No bullet points.
- Do not say you are an AI.
- Do not narrate GPS instructions.
- Make it feel like one beat in a continuous guided tour, not a disconnected fact.
- Sound like you know where we are in the drive right now.
- If we are already at the current point of interest, say so directly in natural language, like "We're here at ..." or "Right here at ...".
- When we are already at the focus stop, describe the place in the present tense and do not frame it as upcoming.
- If there is a next point of interest, focus on why it is visually or culturally interesting.
- If there is no next point of interest, make the destination feel like the finale and include one memorable fact.
- Use the current local route time and the expected focus time naturally when it helps.
- If the focus is timed for sunrise, sunset, twilight, dusk, evening glow, or night views, lean into that actual light window.
- If minutes-until-focus is short, make the line feel like an approach. If it is longer, make it feel like we are rolling toward the next scene.
- Mention one concrete sensory or visual detail when possible.
- Avoid repeating any recent phrasing.

Trip context:
- City: {payload.city}
- Route summary: {payload.route_summary}
- Progress: {payload.progress_percent:.0f}%
- Travel mode: {travel_mode}
- Current local route time: {current_time}
- Route phase: {payload.route_phase or "en route"}
- Already at the current focus: {"yes" if payload.is_at_focus else "no"}
- Weather: {payload.weather_summary or "not specified"}
- Minutes until the current focus: {minutes_until_focus}
- Minutes until destination: {minutes_until_destination}
- Remaining POIs after this: {payload.remaining_poi_count}

Current focus ({focus_kind}):
- Title: {focus.title}
- Place name: {focus.place_name}
- Detail: {focus.detail or "no extra detail"}
- Best time there: {focus_eta}

Recent commentary to avoid repeating:
{recent_lines or "- none"}
""".strip()


def _normalize_commentary(text: str | None) -> str:
    if not text:
        return ""

    normalized = " ".join(segment.strip() for segment in text.splitlines() if segment.strip())
    if len(normalized) <= 240:
        return normalized

    truncated = normalized[:240].rstrip()
    sentence_end = max(truncated.rfind("."), truncated.rfind("!"), truncated.rfind("?"))
    if sentence_end >= 80:
        return truncated[: sentence_end + 1].strip()

    last_space = truncated.rfind(" ")
    if last_space >= 80:
        return f"{truncated[:last_space].rstrip()}."

    return truncated


def _fallback_copy(payload: NavigationCommentaryRequest) -> str:
    focus = payload.next_poi or payload.destination
    eta = focus.eta_label or "soon"
    current_time = payload.current_time_label or "right now"
    if payload.next_poi:
        if payload.minutes_until_focus is not None:
            return (
                f"It is {current_time}, and {focus.title} should hit best around {eta}. "
                f"In about {payload.minutes_until_focus} minutes, {focus.place_name} comes into its stride."
            )
        return (
            f"{focus.title} is best around {eta}. Keep an eye out for {focus.place_name}, "
            f"it is one of the strongest stops on this route."
        )

    if payload.minutes_until_destination is not None:
        return (
            f"It is {current_time}, and {focus.place_name} should land best around {eta}. "
            f"You are about {payload.minutes_until_destination} minutes from the final scene."
        )

    return (
        f"You are closing in on {focus.place_name}. It is the final anchor for this route, "
        "so this is the moment to take in the setting before you arrive."
    )
