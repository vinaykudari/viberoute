from __future__ import annotations

from datetime import date

import httpx

from ..models import WeatherHour, WeatherSnapshot
from .geocoding import get_geocoder


class WeatherProvider:
    FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
    SUN_URL = "https://api.sunrise-sunset.org/json"

    async def get_weather(
        self,
        *,
        area_label: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        timezone: str | None = None,
        include_daylight: bool = False,
    ) -> WeatherSnapshot | None:
        resolved_label = area_label.strip() if area_label else ""
        resolved_latitude = latitude
        resolved_longitude = longitude
        resolved_timezone = timezone

        if resolved_latitude is None or resolved_longitude is None:
            if not resolved_label:
                return None

            try:
                geocoder = get_geocoder()
                geocode_results = await geocoder.geocode(query=resolved_label, count=1)
                if not geocode_results:
                    return None

                location = geocode_results[0]
                resolved_label = location.name
                resolved_latitude = location.latitude
                resolved_longitude = location.longitude
                resolved_timezone = resolved_timezone or location.timezone
            except Exception:
                return None

        if resolved_latitude is None or resolved_longitude is None:
            return None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                forecast_response = await client.get(
                    self.FORECAST_URL,
                    params={
                        "latitude": resolved_latitude,
                        "longitude": resolved_longitude,
                        "timezone": "auto",
                        "forecast_days": 1,
                        "hourly": "temperature_2m,precipitation_probability,weather_code",
                    },
                )

            forecast_response.raise_for_status()

            forecast = forecast_response.json()
            hourly = _build_hourly_forecast(forecast.get("hourly", {}))
            sunrise_time_iso = None
            sunset_time_iso = None
            forecast_timezone = forecast.get("timezone") or resolved_timezone

            if include_daylight:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    sun_response = await client.get(
                        self.SUN_URL,
                        params={
                            "lat": resolved_latitude,
                            "lng": resolved_longitude,
                            "formatted": 0,
                            "date": "today",
                            "tzid": forecast_timezone or "UTC",
                        },
                    )
                sun_response.raise_for_status()
                sun_payload = sun_response.json()
                results = sun_payload.get("results", {})
                sunrise_time_iso = results.get("sunrise")
                sunset_time_iso = results.get("sunset")

            return WeatherSnapshot(
                areaLabel=resolved_label or "Inferred route area",
                dateIso=date.today().isoformat(),
                summary=_summarize_hourly_forecast(hourly),
                latitude=resolved_latitude,
                longitude=resolved_longitude,
                timezone=forecast_timezone,
                sunriseTimeIso=sunrise_time_iso,
                sunsetTimeIso=sunset_time_iso,
                hourly=hourly,
            )
        except Exception:
            return None


def get_weather_provider() -> WeatherProvider:
    return WeatherProvider()


def _build_hourly_forecast(hourly_payload: dict) -> list[WeatherHour]:
    times = hourly_payload.get("time", [])
    temperatures = hourly_payload.get("temperature_2m", [])
    precipitation = hourly_payload.get("precipitation_probability", [])
    weather_codes = hourly_payload.get("weather_code", [])

    hours: list[WeatherHour] = []
    for time_iso, temp, precip, code in zip(
        times,
        temperatures,
        precipitation,
        weather_codes,
        strict=False,
    ):
        condition = _map_weather_code(code)
        hours.append(
            WeatherHour(
                timeIso=time_iso,
                condition=condition,
                temperatureC=float(temp),
                precipitationProbability=float(precip) / 100.0,
                outdoorFriendly=(float(precip) < 35 and condition not in {"rain", "windy"}),
            )
        )

    return hours


def _map_weather_code(code: int) -> str:
    if code in {0, 1}:
        return "clear"
    if code in {2, 3}:
        return "cloudy"
    if code in {45, 48}:
        return "fog"
    if code in {51, 53, 55, 56, 57}:
        return "drizzle"
    if code in {61, 63, 65, 66, 67, 80, 81, 82}:
        return "rain"
    if code in {71, 73, 75, 77, 85, 86}:
        return "cloudy"
    return "windy"


def _summarize_hourly_forecast(hourly: list[WeatherHour]) -> str:
    if not hourly:
        return "Forecast unavailable."

    wet_hours = [hour for hour in hourly if not hour.outdoor_friendly]
    if not wet_hours:
        return "Mostly friendly outdoor conditions through the day."

    worst = wet_hours[0]
    return (
        f"Forecast is less outdoor-friendly around {worst.time_iso[11:16]}, "
        f"with {worst.condition} and a {int(worst.precipitation_probability * 100)}% rain risk."
    )
