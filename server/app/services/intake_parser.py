from __future__ import annotations

import re

from ..models import IntakePreferences

TIME_PATTERN = re.compile(
    r"\b(?P<hour>1[0-2]|0?[1-9])(?::(?P<minute>[0-5][0-9]))?\s*(?P<ampm>am|pm)\b",
    flags=re.IGNORECASE,
)


def merge_preferences_from_message(
    *,
    message: str,
    current: IntakePreferences | None,
) -> IntakePreferences:
    prefs = current.model_copy(deep=True) if current else IntakePreferences(city="")
    normalized = message.strip()
    lower = normalized.lower()

    if not prefs.city:
        city_match = re.search(
            r"\b(?:in|around|explore|for)\s+([A-Z][A-Za-z\s]+)$",
            normalized,
        )
        if city_match:
            prefs.city = city_match.group(1).strip(" .")
        elif len(normalized.split()) <= 4 and normalized and normalized[0].isupper():
            prefs.city = normalized.strip(" .")

    start_area_match = re.search(
        r"\bstart(?:ing)?\s+(?:in|near|around|at)\s+(.+?)(?:\s+at\s+\d|$)",
        lower,
    )
    if start_area_match:
        prefs.start_area = _title_case_fragment(start_area_match.group(1))

    end_area_match = re.search(
        r"\b(?:end|finish|wind down)\s+(?:in|near|around|at)\s+(.+?)(?:\s+by\s+\d|$)",
        lower,
    )
    if end_area_match:
        prefs.end_area = _title_case_fragment(end_area_match.group(1))

    start_time_match = re.search(
        r"\bstart(?:ing)?(?:\s+\w+){0,4}?\s+at\s+(.+)$",
        lower,
    )
    if start_time_match:
        parsed_time = _extract_time(start_time_match.group(1))
        if parsed_time:
            prefs.start_time = parsed_time
    elif not prefs.start_time:
        parsed_time = _extract_time(lower)
        if parsed_time and any(token in lower for token in ("start", "begin", "morning")):
            prefs.start_time = parsed_time

    end_time_match = re.search(r"\b(?:end|finish|by|until)\s+(.+)$", lower)
    if end_time_match:
        parsed_time = _extract_time(end_time_match.group(1))
        if parsed_time:
            prefs.end_time = parsed_time

    if "relaxed" in lower or "slow" in lower or "easy" in lower:
        prefs.vibe_override = "Relaxed and unhurried."
    elif "active" in lower or "packed" in lower or "busy" in lower:
        prefs.vibe_override = "More active and dense."

    return prefs


def _extract_time(text: str) -> str | None:
    match = TIME_PATTERN.search(text)
    if not match:
        return None

    hour = int(match.group("hour"))
    minute = int(match.group("minute") or 0)
    ampm = match.group("ampm").lower()

    if ampm == "pm" and hour != 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0

    return f"{hour:02d}:{minute:02d}"


def _title_case_fragment(value: str) -> str:
    return " ".join(word.capitalize() for word in value.strip(" .,").split())
