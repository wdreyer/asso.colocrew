"use client";

import React, { useMemo } from "react";
import { FaCalendarAlt, FaMoneyBillWave, FaTrain } from "react-icons/fa";
import { extractPriceRange, formatPriceNumber } from "@/src/lib/pricing";

const SUR_PLACE_LABEL = "Sur place";

function normalizeCityName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isSurPlace(value) {
  return normalizeCityName(value) === "sur place";
}

function getStationOptions(stations = []) {
  const rows = Array.isArray(stations) ? stations : [];
  const normalized = rows
    .filter((station) => station && typeof station === "object" && station.name)
    .map((station) => ({
      ...station,
      name: isSurPlace(station.name) ? SUR_PLACE_LABEL : String(station.name).trim(),
      priceExtra: isSurPlace(station.name) ? 0 : Number(station.priceExtra) || 0,
    }));

  if (!normalized.some((station) => isSurPlace(station.name))) {
    normalized.unshift({
      name: SUR_PLACE_LABEL,
      priceExtra: 0,
    });
  }

  return normalized;
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
    const parsed = extractPriceRange(reservationPrice);
    const transport = Number(transportPrice) || 0;
    return {
      min: parsed.min + transport,
      max: parsed.max + transport,
    };
  }, [reservationPrice, transportPrice]);

  const totalDisplay =
    total.min === total.max
      ? `${formatPriceNumber(total.min)} €`
      : `${formatPriceNumber(total.min)} - ${formatPriceNumber(total.max)} €`;

  const stayDisplay = (() => {
    const parsed = extractPriceRange(reservationPrice);
    if (parsed.min === parsed.max) return `${formatPriceNumber(parsed.min)} €`;
    return `${formatPriceNumber(parsed.min)} - ${formatPriceNumber(parsed.max)} €`;
  })();

  const stationOptions = getStationOptions(sejour?.stations);

  const scrollToCard = () => {
    const el =
      document.getElementById("reservation-card-mobile") ||
      document.getElementById("reservation-card");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e6d8e3] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(255,246,251,0.97)_100%)] shadow-[0_-8px_24px_rgba(33,21,55,0.14)] backdrop-blur-md">

      {/* ── Mobile : bouton simple ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:hidden">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#B8336A]">Tarif estimé</p>
          <p className="text-sm font-bold text-[#24173d]">{totalDisplay}</p>
        </div>
        <button
          onClick={scrollToCard}
          className="shrink-0 cursor-pointer rounded-full bg-[#B8336A] px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:bg-[#982a57]"
        >
          Estimer mon tarif →
        </button>
      </div>

      {/* ── Desktop : barre complète ── */}
      <div className="no-scrollbar hidden items-center gap-2 overflow-x-auto px-3 py-2 pr-[92px] md:flex md:px-5 md:pr-[108px] lg:justify-center">
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
            const promoStart = String(sejour?.promotion?.startDate || "").slice(0, 10);
            const isPromo = Boolean(sejour?.promotion?.active && promoStart && String(value || "").slice(0, 10) === promoStart);
            return (
              <option key={`bottom-date-${idx}`} value={value}>
                {isPromo ? "✦ Offre · " : ""}{dateOptionLabel(dateOption)}
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
          <FaTrain className="text-[#B8336A]" /> Transport {formatPriceNumber(transportPrice)} €
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
