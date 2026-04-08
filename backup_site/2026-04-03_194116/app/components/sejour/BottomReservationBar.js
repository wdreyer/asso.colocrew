"use client";

import React, { useMemo } from "react";
import { FaCalendarAlt, FaMoneyBillWave, FaTrain } from "react-icons/fa";

function formatPrice(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function parsePriceValue(rawPrice) {
  if (typeof rawPrice === "number") {
    return { min: rawPrice, max: rawPrice };
  }

  if (typeof rawPrice === "string") {
    const numericValues = rawPrice.match(/\d+[.,]?\d*/g);
    if (!numericValues || numericValues.length === 0) return { min: 0, max: 0 };
    const normalized = numericValues
      .map((value) => Number(value.replace(",", ".")))
      .filter((value) => !Number.isNaN(value));
    if (normalized.length === 0) return { min: 0, max: 0 };
    if (normalized.length === 1) return { min: normalized[0], max: normalized[0] };
    return { min: Math.min(...normalized), max: Math.max(...normalized) };
  }

  return { min: 0, max: 0 };
}

function dateOptionLabel(option) {
  if (typeof option === "object") {
    const start = new Date(option.startDate);
    const end = new Date(option.endDate);
    return `${start.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })} au ${end.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  const asDate = new Date(option);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return option;
}

export default function BottomReservationBar({
  sejour,
  selectedDate,
  selectedAgeGroup,
  reservationPrice,
  transportPrice,
  handleDateChange,
  handleAgeGroupChange,
  handleReservation,
  isRoundTrip,
  onRoundTripChange,
  selectedDepartureCity,
  selectedReturnCity,
  onDepartureCityChange,
  onReturnCityChange,
}) {
  const total = useMemo(() => {
    const parsed = parsePriceValue(reservationPrice);
    const transport = Number(transportPrice) || 0;
    return {
      min: parsed.min + transport,
      max: parsed.max + transport,
    };
  }, [reservationPrice, transportPrice]);

  const totalDisplay =
    total.min === total.max
      ? `${formatPrice(total.min)} €`
      : `${formatPrice(total.min)} - ${formatPrice(total.max)} €`;

  const stayDisplay = (() => {
    const parsed = parsePriceValue(reservationPrice);
    if (parsed.min === parsed.max) return `${formatPrice(parsed.min)} €`;
    return `${formatPrice(parsed.min)} - ${formatPrice(parsed.max)} €`;
  })();

  const stationOptions = sejour?.stations || [];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e6d8e3] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(255,246,251,0.97)_100%)] shadow-[0_-8px_24px_rgba(33,21,55,0.14)] backdrop-blur-md">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 py-2 pr-[92px] md:px-5 md:pr-[108px] lg:justify-center">
        <span className="shrink-0 rounded-full border border-[#eadfce] bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#B8336A]">
          Tarif
        </span>
        <select
          value={selectedDate}
          onChange={handleDateChange}
          className="h-9 min-w-[170px] shrink-0 rounded-lg border border-[#dfd3e8] bg-white px-2.5 text-xs font-semibold text-[#2f254b]"
          aria-label="Date du séjour"
        >
          {sejour?.dates?.map((dateOption, idx) => {
            const value = typeof dateOption === "object" ? dateOption.startDate : dateOption;
            return (
              <option key={`bottom-date-${idx}`} value={value}>
                {dateOptionLabel(dateOption)}
              </option>
            );
          })}
        </select>

        <select
          value={selectedAgeGroup}
          onChange={handleAgeGroupChange}
          className="h-9 min-w-[92px] shrink-0 rounded-lg border border-[#dfd3e8] bg-white px-2.5 text-xs font-semibold text-[#2f254b]"
          aria-label="Âge"
        >
          {sejour?.ageGroups?.map((ageGroup, idx) => (
            <option key={`bottom-age-${idx}`} value={ageGroup}>{ageGroup} ans</option>
          ))}
        </select>

        <select
          value={selectedDepartureCity}
          onChange={(e) => {
            const city = e.target.value;
            onDepartureCityChange(city);
            if (!isRoundTrip) onReturnCityChange(city);
          }}
          className="h-9 min-w-[148px] shrink-0 rounded-lg border border-[#dfd3e8] bg-white px-2.5 text-xs font-semibold text-[#2f254b]"
          aria-label="Ville aller"
        >
          {stationOptions.map((station) => (
            <option key={`bottom-dep-${station.name}`} value={station.name}>{station.name}</option>
          ))}
        </select>

        {isRoundTrip ? (
          <select
            value={selectedReturnCity}
            onChange={(e) => onReturnCityChange(e.target.value)}
            className="h-9 min-w-[148px] shrink-0 rounded-lg border border-[#dfd3e8] bg-white px-2.5 text-xs font-semibold text-[#2f254b]"
            aria-label="Ville retour"
          >
            {stationOptions.map((station) => (
              <option key={`bottom-ret-${station.name}`} value={station.name}>{station.name}</option>
            ))}
          </select>
        ) : null}

        <label className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-[#e8d6e2] bg-[#fff3f8] px-2.5 py-2 text-xs font-semibold text-[#4f4567]">
          <input
            type="checkbox"
            checked={isRoundTrip}
            onChange={(e) => onRoundTripChange(e.target.checked)}
            className="h-4 w-4 rounded border-[#d8c8e6] text-[#B8336A]"
          />
          A/R diff.
        </label>

        <span className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#e8d6e2] bg-[#fff3f8] px-2.5 py-2 text-xs font-semibold text-[#4f4567]">
          <FaMoneyBillWave className="text-[#B8336A]" /> Séjour {stayDisplay}
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#e8d6e2] bg-[#fff3f8] px-2.5 py-2 text-xs font-semibold text-[#4f4567]">
          <FaTrain className="text-[#B8336A]" /> Transport {formatPrice(transportPrice)} €
        </span>
        <span className="shrink-0 rounded-lg border border-[#e8d6e2] bg-[#fff3f8] px-2.5 py-2 text-xs font-bold text-[#B8336A]">
          Total {totalDisplay}
        </span>

        <button
          onClick={handleReservation}
          className="shrink-0 cursor-pointer rounded-full bg-[#B8336A] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#982a57]"
        >
          Estimer
        </button>
      </div>
    </div>
  );
}
