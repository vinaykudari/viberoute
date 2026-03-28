"use client";

import type { DayPlan, MapHighlightCard } from "@viberoute/shared";

type MapHighlightRailProps = {
  cards: MapHighlightCard[];
  plan?: DayPlan;
  onFocusCard: (card: MapHighlightCard) => void;
};

export function MapHighlightRail({
  cards,
  plan,
  onFocusCard,
}: MapHighlightRailProps) {
  if (!cards.length) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#090b10] via-[#090b10]/96 to-transparent" />
      <div className="pointer-events-auto relative flex gap-3 overflow-x-auto px-5 pb-5 pt-14">
        {cards.map((card) => (
          <MapHighlightRailCard
            key={card.id}
            card={card}
            plan={plan}
            onFocusCard={onFocusCard}
          />
        ))}
      </div>
    </div>
  );
}

function MapHighlightRailCard({
  card,
  plan,
  onFocusCard,
}: {
  card: MapHighlightCard;
  plan?: DayPlan;
  onFocusCard: (card: MapHighlightCard) => void;
}) {
  const stop = plan?.stops.find((item) =>
    item.sourceImageIds.includes(card.sourceImageId),
  );
  const metrics = [
    stop?.visitDurationMinutes != null
      ? `${stop.visitDurationMinutes} min there`
      : null,
    stop?.travelMinutesFromPrevious != null
      ? `${_formatTravelMode(stop.travelModeFromPrevious)} ${stop.travelMinutesFromPrevious} min`
      : null,
    stop?.estimatedSpendUsdMin != null && stop.estimatedSpendUsdMax != null
      ? _formatSpendRange(stop.estimatedSpendUsdMin, stop.estimatedSpendUsdMax)
      : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onFocusCard(card)}
      className="group min-w-[290px] max-w-[320px] rounded-3xl border bg-[#0c0f15] px-5 py-4 text-left shadow-[0_26px_70px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 hover:bg-[#10141c]"
      style={{ borderColor: `${card.color}55` }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: card.color }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/78">
            {card.timeLabel}
          </span>
        </div>
        <span className="truncate text-[11px] font-medium text-white/52">
          {card.placeName}
        </span>
      </div>

      <p className="text-[24px] font-semibold leading-[1.15] tracking-tight text-white">
        {card.title}
      </p>
      {metrics.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <span
              key={metric}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/72"
            >
              {metric}
            </span>
          ))}
        </div>
      ) : null}
      {card.detail ? (
        <p className="mt-3 text-[14px] leading-6 text-white/78">{card.detail}</p>
      ) : null}
    </button>
  );
}

function _formatTravelMode(
  mode: DayPlan["segments"][number]["mode"] | null | undefined,
) {
  return {
    walk: "Walk",
    drive: "Drive",
    transit: "Transit",
  }[mode ?? "drive"];
}

function _formatSpendRange(min: number, max: number) {
  if (min === max) {
    return `$${min}`;
  }
  return `$${min}-${max}`;
}
