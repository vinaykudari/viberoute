from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from ..models import (
    DayPlan,
    IntakePreferences,
    PlannedStop,
    RouteSegment,
    SceneIntent,
    WeatherSnapshot,
)
from .geocoding import get_geocoder


class RoutePlanner:
    OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving"

    async def build_plan(
        self,
        *,
        preferences: IntakePreferences,
        scenes: list[SceneIntent],
        weather: WeatherSnapshot | None,
        current_plan: DayPlan | None = None,
    ) -> DayPlan:
        timezone_name = weather.timezone if weather and weather.timezone else "UTC"
        tz = ZoneInfo(timezone_name)
        plan_date = weather.date_iso if weather else datetime.now(tz).date().isoformat()
        start_dt = (
            _combine_local(plan_date, preferences.start_time, tz)
            if preferences.start_time
            else _infer_start_time(plan_date, scenes, weather, tz)
        )

        planned_stops = self._schedule_stops(
            scenes=scenes,
            start_dt=start_dt,
            weather=weather,
            timezone=tz,
        )
        segments = await self._build_segments(planned_stops)
        _apply_segment_metrics(planned_stops, segments)
        start_location, end_location = await self._resolve_boundaries(
            preferences=preferences,
            city=preferences.city or weather.area_label if weather else "",
            planned_stops=planned_stops,
        )
        plan_city = _resolve_plan_city(preferences, weather, planned_stops, scenes)

        summary = _build_plan_summary(
            city=plan_city,
            preferences=preferences,
            scenes=scenes,
            weather=weather,
        )

        return DayPlan(
            city=plan_city,
            startLocation=start_location,
            endLocation=end_location,
            stops=planned_stops,
            segments=segments,
            summary=summary,
        )

    def _schedule_stops(
        self,
        *,
        scenes: list[SceneIntent],
        start_dt: datetime,
        weather: WeatherSnapshot | None,
        timezone: ZoneInfo,
    ) -> list[PlannedStop]:
        scene_slots = [
            (scene, _scene_target_time(scene, start_dt, weather, timezone))
            for scene in scenes
            if _select_route_candidate(scene) is not None
        ]
        scene_slots.sort(key=lambda item: item[1])

        current_dt = start_dt
        planned_stops: list[PlannedStop] = []
        for index, (scene, target_dt) in enumerate(scene_slots):
            stop_start = max(current_dt, target_dt)
            if _is_outdoor_scene(scene) and weather:
                stop_start = _move_to_outdoor_friendly_hour(stop_start, weather)
            stop_end = stop_start + timedelta(minutes=scene.duration_minutes)
            candidate = _select_route_candidate(scene)
            if candidate is None or candidate.lat is None or candidate.lng is None:
                continue

            planned_stops.append(
                PlannedStop(
                    id=f"stop-{index + 1}",
                    title=candidate.name,
                    lat=candidate.lat,
                    lng=candidate.lng,
                    startTimeIso=stop_start.isoformat(),
                    endTimeIso=stop_end.isoformat(),
                    routeColor=_scene_color(scene.scene_type),
                    sourceImageIds=[scene.image_id],
                    rationale=_build_stop_rationale(scene, weather, stop_start),
                    visitDurationMinutes=scene.duration_minutes,
                    estimatedSpendUsdMin=_estimate_stop_spend(scene)[0],
                    estimatedSpendUsdMax=_estimate_stop_spend(scene)[1],
                )
            )
            current_dt = stop_end + timedelta(minutes=20)

        return planned_stops

    async def _resolve_boundaries(
        self,
        *,
        preferences: IntakePreferences,
        city: str,
        planned_stops: list[PlannedStop],
    ):
        start_location = None
        end_location = None

        try:
            geocoder = get_geocoder()
            queries = []
            if preferences.start_area:
                queries.append(
                    geocoder.geocode(
                        query=f"{preferences.start_area}, {city}",
                        count=1,
                    )
                )
            if preferences.end_area:
                queries.append(
                    geocoder.geocode(
                        query=f"{preferences.end_area}, {city}",
                        count=1,
                    )
                )

            results = await asyncio.gather(*queries) if queries else []
            result_index = 0

            if preferences.start_area:
                matches = results[result_index]
                result_index += 1
                if matches:
                    match = matches[0]
                    start_location = {
                        "label": preferences.start_area,
                        "lat": match.latitude,
                        "lng": match.longitude,
                    }

            if preferences.end_area:
                matches = results[result_index]
                if matches:
                    match = matches[0]
                    end_location = {
                        "label": preferences.end_area,
                        "lat": match.latitude,
                        "lng": match.longitude,
                    }
        except Exception:
            start_location = None
            end_location = None

        if start_location is None and planned_stops:
            first_stop = planned_stops[0]
            start_location = {
                "label": first_stop.title,
                "lat": first_stop.lat,
                "lng": first_stop.lng,
            }

        if end_location is None and planned_stops:
            last_stop = planned_stops[-1]
            end_location = {
                "label": last_stop.title,
                "lat": last_stop.lat,
                "lng": last_stop.lng,
            }

        return start_location, end_location

    async def _build_segments(self, stops: list[PlannedStop]) -> list[RouteSegment]:
        if len(stops) < 2:
            return []

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                responses = await asyncio.gather(
                    *(
                        client.get(
                            f"{self.OSRM_ROUTE_URL}/{current_stop.lng},{current_stop.lat};{next_stop.lng},{next_stop.lat}",
                            params={
                                "overview": "full",
                                "geometries": "geojson",
                            },
                        )
                        for current_stop, next_stop in zip(stops, stops[1:], strict=False)
                    )
                )
        except Exception:
            return []

        segments: list[RouteSegment] = []
        stop_pairs = list(zip(stops, stops[1:], strict=False))

        for index, ((current_stop, next_stop), response) in enumerate(
            zip(stop_pairs, responses, strict=False),
            start=1,
        ):
            if not response.is_success:
                return []

            payload = response.json()
            route = payload.get("routes", [{}])[0]
            geometry = route.get("geometry", {}).get("coordinates", [])
            if not geometry:
                return []

            path = _pin_segment_to_stop_coordinates(
                current_stop=current_stop,
                next_stop=next_stop,
                geometry=geometry,
            )
            duration_minutes = int(route.get("duration", 0) / 60)

            segments.append(
                RouteSegment(
                    id=f"segment-{index}",
                    fromStopId=current_stop.id,
                    toStopId=next_stop.id,
                    routeColor=current_stop.route_color,
                    mode="drive",
                    durationMinutes=max(duration_minutes, 1),
                    path=path,
                )
            )

        return segments


def get_route_planner() -> RoutePlanner:
    return RoutePlanner()


def _pin_segment_to_stop_coordinates(
    *,
    current_stop: PlannedStop,
    next_stop: PlannedStop,
    geometry: list[list[float]],
) -> list[dict[str, float]]:
    path = [{"lat": point[1], "lng": point[0]} for point in geometry]
    if not path:
        return []

    start_point = {"lat": current_stop.lat, "lng": current_stop.lng}
    end_point = {"lat": next_stop.lat, "lng": next_stop.lng}

    if path[0] != start_point:
        path = [start_point, *path]
    else:
        path[0] = start_point

    if path[-1] != end_point:
        path = [*path, end_point]
    else:
        path[-1] = end_point

    return path


def _combine_local(date_iso: str, time_text: str, timezone: ZoneInfo) -> datetime:
    hour, minute = (int(part) for part in time_text.split(":", 1))
    year, month, day = (int(part) for part in date_iso.split("-", 2))
    return datetime(year, month, day, hour, minute, tzinfo=timezone)


def _infer_start_time(
    date_iso: str,
    scenes: list[SceneIntent],
    weather: WeatherSnapshot | None,
    timezone: ZoneInfo,
) -> datetime:
    preferences = [scene.time_preference for scene in scenes]
    if "sunrise" in preferences and weather and weather.sunrise_time_iso:
        return datetime.fromisoformat(weather.sunrise_time_iso).astimezone(timezone) - timedelta(minutes=30)
    if "morning" in preferences:
        return _combine_local(date_iso, "09:00", timezone)
    if "midday" in preferences:
        return _combine_local(date_iso, "11:00", timezone)
    if "afternoon" in preferences:
        return _combine_local(date_iso, "13:00", timezone)
    if "sunset" in preferences or "evening" in preferences:
        return _combine_local(date_iso, "16:00", timezone)
    if "night" in preferences:
        return _combine_local(date_iso, "18:30", timezone)
    return _combine_local(date_iso, "10:00", timezone)


def _scene_target_time(
    scene: SceneIntent,
    start_dt: datetime,
    weather: WeatherSnapshot | None,
    timezone: ZoneInfo,
) -> datetime:
    base_date = start_dt.date().isoformat()
    if scene.time_preference == "sunrise" and weather and weather.sunrise_time_iso:
        return datetime.fromisoformat(weather.sunrise_time_iso).astimezone(timezone)
    if scene.time_preference == "sunset" and weather and weather.sunset_time_iso:
        return datetime.fromisoformat(weather.sunset_time_iso).astimezone(timezone) - timedelta(minutes=45)

    offsets = {
        "morning": timedelta(minutes=45),
        "midday": timedelta(hours=3),
        "afternoon": timedelta(hours=5, minutes=30),
        "evening": timedelta(hours=9),
        "night": timedelta(hours=11),
        "flexible": timedelta(hours=2),
    }
    if scene.time_preference in offsets:
        return start_dt + offsets[scene.time_preference]

    return _combine_local(base_date, "12:00", timezone)


def _move_to_outdoor_friendly_hour(current: datetime, weather: WeatherSnapshot) -> datetime:
    if not weather.hourly:
        return current

    nearby_hours = sorted(
        weather.hourly,
        key=lambda hour: abs(
            datetime.fromisoformat(hour.time_iso).timestamp() - current.timestamp()
        ),
    )
    for hour in nearby_hours:
        if hour.outdoor_friendly:
            candidate_dt = datetime.fromisoformat(hour.time_iso)
            if candidate_dt.tzinfo is None and current.tzinfo is not None:
                candidate_dt = candidate_dt.replace(tzinfo=current.tzinfo)
            return candidate_dt.replace(
                minute=current.minute,
                second=0,
                microsecond=0,
            )
    return current


def _is_outdoor_scene(scene: SceneIntent) -> bool:
    return scene.scene_type in {"park", "viewpoint", "landmark", "neighborhood"}


def _build_stop_rationale(
    scene: SceneIntent,
    weather: WeatherSnapshot | None,
    start_time: datetime,
) -> str:
    rationale = f"Matches the {scene.time_preference} energy inferred from the image."
    if _is_outdoor_scene(scene) and weather:
        rationale = (
            f"{rationale} Scheduled around the forecast to keep outdoor time away from the worst conditions."
        )
    return rationale


def _apply_segment_metrics(stops: list[PlannedStop], segments: list[RouteSegment]) -> None:
    segment_by_destination = {
        segment.to_stop_id: segment
        for segment in segments
    }
    for stop in stops:
        segment = segment_by_destination.get(stop.id)
        if segment is None:
            continue
        stop.travel_minutes_from_previous = segment.duration_minutes
        stop.travel_mode_from_previous = segment.mode


def _estimate_stop_spend(scene: SceneIntent) -> tuple[int, int]:
    extra_half_hours = max(scene.duration_minutes - 60, 0) // 30

    base_ranges: dict[str, tuple[int, int]] = {
        "viewpoint": (0, 12),
        "park": (0, 10),
        "neighborhood": (0, 18),
        "landmark": (0, 20),
        "museum": (18, 36),
        "food": (18, 48),
        "shopping": (25, 90),
        "nightlife": (22, 72),
        "other": (10, 30),
    }
    baseline_min, baseline_max = base_ranges.get(scene.scene_type, (10, 30))

    min_spend = baseline_min + extra_half_hours * (
        8 if scene.scene_type in {"food", "shopping", "nightlife"} else 3
    )
    max_spend = baseline_max + extra_half_hours * (
        18 if scene.scene_type in {"food", "shopping", "nightlife"} else 6
    )
    return min_spend, max(min_spend, max_spend)


def _build_plan_summary(
    *,
    city: str,
    preferences: IntakePreferences,
    scenes: list[SceneIntent],
    weather: WeatherSnapshot | None,
) -> str:
    scene_titles = ", ".join(scene.title for scene in scenes[:3]) or "uploaded scenes"
    weather_note = f" Weather note: {weather.summary}" if weather else ""
    vibe_note = (
        f" Built around {preferences.vibe_override.lower()} preferences."
        if preferences.vibe_override
        else ""
    )
    return (
        f"A vibe-first route through {city} shaped by {scene_titles}.{weather_note}{vibe_note}"
    )


def _resolve_plan_city(
    preferences: IntakePreferences,
    weather: WeatherSnapshot | None,
    planned_stops: list[PlannedStop],
    scenes: list[SceneIntent],
) -> str:
    if preferences.city:
        return preferences.city
    if weather and weather.area_label:
        return weather.area_label
    if planned_stops:
        return planned_stops[0].title
    for scene in scenes:
        candidate = _select_route_candidate(scene)
        if candidate is not None:
            return candidate.name
    return "Inferred route"


def _select_route_candidate(scene: SceneIntent):
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
