from __future__ import annotations

from pydantic import BaseModel
import httpx


class GeocodeResult(BaseModel):
    name: str
    latitude: float
    longitude: float
    timezone: str | None = None
    country: str | None = None
    admin1: str | None = None


class OpenMeteoGeocoder:
    BASE_URL = "https://geocoding-api.open-meteo.com/v1/search"
    NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

    async def geocode(self, *, query: str, count: int = 5) -> list[GeocodeResult]:
        if not query.strip():
            return []

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                self.BASE_URL,
                params={
                    "name": query,
                    "count": count,
                    "language": "en",
                    "format": "json",
                },
            )
            response.raise_for_status()

        payload = response.json()
        results = payload.get("results", [])
        parsed_results = [
            GeocodeResult(
                name=result["name"],
                latitude=result["latitude"],
                longitude=result["longitude"],
                timezone=result.get("timezone"),
                country=result.get("country"),
                admin1=result.get("admin1"),
            )
            for result in results
        ]
        if parsed_results:
            return parsed_results

        async with httpx.AsyncClient(
            timeout=10.0,
            headers={
                "User-Agent": "VibeRoute/0.1 (planner geocoding)",
            },
        ) as client:
            fallback_response = await client.get(
                self.NOMINATIM_URL,
                params={
                    "q": query,
                    "format": "jsonv2",
                    "limit": count,
                    "addressdetails": 1,
                },
            )
            fallback_response.raise_for_status()

        fallback_results = fallback_response.json()
        return [
            GeocodeResult(
                name=result.get("display_name") or result.get("name") or query,
                latitude=float(result["lat"]),
                longitude=float(result["lon"]),
                country=(result.get("address") or {}).get("country"),
                admin1=(result.get("address") or {}).get("state"),
            )
            for result in fallback_results
        ]


def get_geocoder() -> OpenMeteoGeocoder:
    return OpenMeteoGeocoder()
