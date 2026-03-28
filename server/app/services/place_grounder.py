from __future__ import annotations

import asyncio

from ..models import PlaceCandidate, SceneIntent
from .geocoding import GeocodeResult, get_geocoder


class PlaceGrounder:
    async def ground_scene(self, *, city: str | None, scene: SceneIntent) -> SceneIntent:
        try:
            geocoder = get_geocoder()
            city_query = (city or "").strip()
            city_results = (
                await geocoder.geocode(query=city_query, count=1)
                if city_query
                else []
            )
            city_center = city_results[0] if city_results else None

            candidate_names = [candidate.name for candidate in scene.place_candidates] or [scene.title]
            geocode_tasks = [
                geocoder.geocode(
                    query=f"{candidate_name}, {city_query}" if city_query else candidate_name,
                    count=2,
                )
                for candidate_name in candidate_names[:3]
            ]
            geocode_groups = await asyncio.gather(*geocode_tasks)

            combined_candidates: list[PlaceCandidate] = []

            for candidate in scene.place_candidates:
                if _is_valid_candidate(candidate, city_center):
                    combined_candidates.append(
                        candidate.model_copy(
                            update={
                                "source": candidate.source or "gemini",
                                "confidence": max(0.3, min(candidate.confidence, 0.98)),
                            }
                        )
                    )

            for results in geocode_groups:
                for result in results:
                    combined_candidates.append(_candidate_from_geocode(result, scene))

            deduped = _dedupe_candidates(combined_candidates)
            if deduped:
                return scene.model_copy(update={"place_candidates": deduped[:3]})
        except Exception:
            return scene

        return scene


def get_place_grounder() -> PlaceGrounder:
    return PlaceGrounder()


def _is_valid_candidate(
    candidate: PlaceCandidate,
    city_center: GeocodeResult | None,
) -> bool:
    if candidate.lat is None or candidate.lng is None:
        return False
    if city_center is None:
        return True
    return (
        abs(candidate.lat - city_center.latitude) <= 1.5
        and abs(candidate.lng - city_center.longitude) <= 1.5
    )


def _candidate_from_geocode(result: GeocodeResult, scene: SceneIntent) -> PlaceCandidate:
    return PlaceCandidate(
        name=result.name,
        lat=result.latitude,
        lng=result.longitude,
        address=", ".join(
            part for part in [result.name, result.admin1, result.country] if part
        ),
        category=scene.scene_type,
        source="geocoder",
        confidence=max(0.45, min(scene.confidence, 0.95)),
    )


def _dedupe_candidates(candidates: list[PlaceCandidate]) -> list[PlaceCandidate]:
    deduped: list[PlaceCandidate] = []
    seen: set[tuple[str, float | None, float | None]] = set()

    for candidate in sorted(candidates, key=lambda item: item.confidence, reverse=True):
        key = (
            candidate.name,
            round(candidate.lat, 4) if candidate.lat is not None else None,
            round(candidate.lng, 4) if candidate.lng is not None else None,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)

    return deduped
