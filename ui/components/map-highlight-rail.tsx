"use client";

import type {
  DayPlan,
  MapHighlightCard,
  WeatherHour,
  WeatherSnapshot,
} from "@viberoute/shared";
import { useMemo } from "react";

/* ── time-preference ordering for chronological sort ── */
const TIME_ORDER: Record<string, number> = {
  sunrise: 0,
  morning: 1,
  midday: 2,
  afternoon: 3,
  sunset: 4,
  evening: 5,
  night: 6,
  flexible: 3, // treat flexible as afternoon-ish
};

/* ── vibe gradient backgrounds per time preference ── */
const VIBE_GRADIENT: Record<string, string> = {
  sunrise: "linear-gradient(135deg, #1a1028 0%, #2d1f3d 40%, #4a2545 100%)",
  morning: "linear-gradient(135deg, #0f1a2e 0%, #1a2a42 40%, #243a56 100%)",
  midday: "linear-gradient(135deg, #0e1926 0%, #162a3a 40%, #1e3a4e 100%)",
  afternoon: "linear-gradient(135deg, #1a1a0e 0%, #2a2a18 40%, #3a3a22 100%)",
  sunset: "linear-gradient(135deg, #1f1018 0%, #3a1a28 40%, #4a2030 100%)",
  evening: "linear-gradient(135deg, #0e0e1e 0%, #181830 40%, #222244 100%)",
  night: "linear-gradient(135deg, #08080f 0%, #0e0e1c 40%, #141428 100%)",
  flexible: "linear-gradient(135deg, #0c1018 0%, #141c26 40%, #1c2832 100%)",
};

/* ── weather condition emoji ── */
const CONDITION_ICON: Record<string, string> = {
  clear: "☀️",
  cloudy: "☁️",
  drizzle: "🌦️",
  rain: "🌧️",
  windy: "💨",
  fog: "🌫️",
};

/* ── representative hour for each time preference ── */
function _hourForTimePreference(tp: string): number {
  return (
    { sunrise: 6, morning: 9, midday: 12, afternoon: 14, sunset: 18, evening: 20, night: 22, flexible: 12 }[tp] ?? 12
  );
}

function _matchWeather(
  weather: WeatherSnapshot | null | undefined,
  timePreference: string,
): WeatherHour | undefined {
  if (!weather?.hourly?.length) return undefined;
  const targetHour = _hourForTimePreference(timePreference);
  // find the hourly entry closest to the target hour
  let best: WeatherHour | undefined;
  let bestDiff = Infinity;
  for (const h of weather.hourly) {
    const d = new Date(h.timeIso);
    const diff = Math.abs(d.getHours() - targetHour);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = h;
    }
  }
  return best;
}

type MapHighlightRailProps = {
  cards: MapHighlightCard[];
  plan?: DayPlan;
  weather?: WeatherSnapshot | null;
  onFocusCard: (card: MapHighlightCard) => void;
  onHoverCard?: (card: MapHighlightCard) => void;
  onLeaveCard?: () => void;
};

export function MapHighlightRail({
  cards,
  plan,
  weather,
  onFocusCard,
  onHoverCard,
  onLeaveCard,
}: MapHighlightRailProps) {
  const sorted = useMemo(
    () =>
      [...cards].sort(
        (a, b) =>
          (TIME_ORDER[a.timePreference] ?? 3) -
          (TIME_ORDER[b.timePreference] ?? 3),
      ),
    [cards],
  );

  if (!sorted.length) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#090b10] via-[#090b10]/96 to-transparent" />
      <div className="pointer-events-auto relative flex gap-2.5 overflow-x-auto px-4 pb-4 pt-10">
        {sorted.map((card) => (
          <MapHighlightRailCard
            key={card.id}
            card={card}
            plan={plan}
            weather={weather}
            onFocusCard={onFocusCard}
            onHoverCard={onHoverCard}
            onLeaveCard={onLeaveCard}
          />
        ))}
      </div>
    </div>
  );
}

function MapHighlightRailCard({
  card,
  plan,
  weather,
  onFocusCard,
  onHoverCard,
  onLeaveCard,
}: {
  card: MapHighlightCard;
  plan?: DayPlan;
  weather?: WeatherSnapshot | null;
  onFocusCard: (card: MapHighlightCard) => void;
  onHoverCard?: (card: MapHighlightCard) => void;
  onLeaveCard?: () => void;
}) {
  const stop = plan?.stops.find((item) =>
    item.sourceImageIds.includes(card.sourceImageId),
  );

  const wx = _matchWeather(weather, card.timePreference);

  const metrics = [
    stop?.visitDurationMinutes != null
      ? `Spend ${stop.visitDurationMinutes} mins`
      : null,
    stop?.travelMinutesFromPrevious != null
      ? `${_formatTravelMode(stop.travelModeFromPrevious)} ${stop.travelMinutesFromPrevious} mins`
      : null,
  ].filter(Boolean);

  const gradient =
    VIBE_GRADIENT[card.timePreference] ?? VIBE_GRADIENT.flexible;

  return (
    <button
      type="button"
      onClick={() => onFocusCard(card)}
      onMouseEnter={() => onHoverCard?.(card)}
      onMouseLeave={() => onLeaveCard?.()}
      className="group min-w-[220px] max-w-[250px] rounded-2xl border border-white/[0.08] px-3.5 py-3 text-left shadow-[0_16px_48px_rgba(0,0,0,0.5)] transition hover:-translate-y-0.5"
      style={{ background: gradient }}
    >
      {/* header row: time dot + weather */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: card.color }}
          />
          <span className="text-[10px] font-normal tracking-[0.04em] text-white/70">
            Best around {card.timeLabel}
          </span>
        </div>
        {wx ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-white/60">
            <span>{CONDITION_ICON[wx.condition] ?? "🌡️"}</span>
            <span>{Math.round(wx.temperatureC)}°</span>
          </span>
        ) : null}
      </div>

      {/* title */}
      <p className="text-[16px] font-semibold leading-[1.2] tracking-tight text-white">
        {card.title}
      </p>

      {/* place name */}
      <p className="mt-0.5 truncate text-[10px] font-medium text-white/50">
        {card.placeName}
      </p>

      {/* metrics pills */}
      {metrics.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {metrics.map((metric) => (
            <span
              key={metric}
              className="rounded-full border border-white/[0.06] bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-white/65"
            >
              {metric}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function _formatTravelMode(
  mode: DayPlan["segments"][number]["mode"] | null | undefined,
) {
  return { walk: "🚶", drive: "🚗", transit: "🚇" }[mode ?? "drive"];
}

