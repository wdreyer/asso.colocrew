"use client";

import React from "react";
import { FaCalendarAlt, FaChild, FaCity, FaMoneyBillWave, FaTrain } from "react-icons/fa";
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

  const hasSurPlace = normalized.some((station) => isSurPlace(station.name));
  if (!hasSurPlace) {
    normalized.unshift({
      name: SUR_PLACE_LABEL,
      priceExtra: 0,
    });
  }

  return normalized;
}

function toDateLabel(option) {
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

export default function ReservationCard({
  sejour,
  selectedDate,
  selectedAgeGroup,
  reservationPrice,
  handleDateChange,
  handleAgeGroupChange,
  handleReservation,
  isRoundTrip,
  handleRoundTripChange,
  selectedDepartureCity,
  selectedReturnCity,
  handleDepartureCityChange,
  handleReturnCityChange,
}) {
  const stationOptions = getStationOptions(sejour?.stations);

  const computeTransportPrice = () => {
    if (isSurPlace(selectedDepartureCity) && (!isRoundTrip || isSurPlace(selectedReturnCity))) {
      return 0;
    }

    const stationByName = (name) =>
      stationOptions.find((station) => normalizeCityName(station?.name) === normalizeCityName(name));

    if (!isRoundTrip) {
      return stationByName(selectedDepartureCity)?.priceExtra || 0;
    }

    if (selectedDepartureCity === selectedReturnCity) {
      return stationByName(selectedDepartureCity)?.priceExtra || 0;
    }

    const dep = stationByName(selectedDepartureCity)?.priceExtra || 0;
    const ret = stationByName(selectedReturnCity)?.priceExtra || 0;
    return dep / 2 + ret / 2;
  };

  const transportPrice = computeTransportPrice();
  const parsedBasePrice = extractPriceRange(reservationPrice);
  const totalMin = parsedBasePrice.min + (Number(transportPrice) || 0);
  const totalMax = parsedBasePrice.max + (Number(transportPrice) || 0);

  const baseDisplay =
    parsedBasePrice.min === parsedBasePrice.max
      ? `${formatPriceNumber(parsedBasePrice.min)} €`
      : `${formatPriceNumber(parsedBasePrice.min)} - ${formatPriceNumber(parsedBasePrice.max)} €`;

  const totalDisplay =
    totalMin === totalMax
      ? `${formatPriceNumber(totalMin)} €`
      : `${formatPriceNumber(totalMin)} - ${formatPriceNumber(totalMax)} €`;

  return (
    <div className="rounded-[22px] border border-[#eadfce] bg-[linear-gradient(180deg,#ffffff_0%,#fff8fc_100%)] p-5 shadow-[0_16px_36px_rgba(33,21,55,0.14)] md:p-6">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#B8336A]">Tarif personnalisé</p>
        <h3 className="mt-1 font-display text-3xl font-bold leading-tight text-[#24173d]">Estimer votre tarif</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 inline-flex items-center gap-2 text-sm font-semibold text-[#40365f]">
            <FaCalendarAlt className="text-[#B8336A]" /> Date du séjour
          </label>
          <select
            value={selectedDate}
            onChange={handleDateChange}
            className="w-full rounded-xl border border-[#dfd3e8] bg-white px-3 py-2.5 text-sm text-[#2f254b] outline-none transition focus:border-[#B8336A]"
          >
            {sejour?.dates?.map((dateOption, idx) => {
              const value = typeof dateOption === "object" ? dateOption.startDate : dateOption;
              return (
                <option key={`date-${idx}`} value={value}>
                  {toDateLabel(dateOption)}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="mb-1.5 inline-flex items-center gap-2 text-sm font-semibold text-[#40365f]">
            <FaChild className="text-[#B8336A]" /> Tranche d’âge
          </label>
          <select
            value={selectedAgeGroup}
            onChange={handleAgeGroupChange}
            className="w-full rounded-xl border border-[#dfd3e8] bg-white px-3 py-2.5 text-sm text-[#2f254b] outline-none transition focus:border-[#B8336A]"
          >
            {sejour?.ageGroups?.map((ageGroup, idx) => (
              <option key={`age-${idx}`} value={ageGroup}>
                {ageGroup} ans
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-[#eadfce] bg-white p-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#40365f]">
            <input
              type="checkbox"
              checked={isRoundTrip}
              onChange={(e) => handleRoundTripChange(e.target.checked)}
              className="h-4 w-4 rounded border-[#d8c8e6] text-[#B8336A]"
            />
            Aller et retour différents
          </label>

          <div className={`mt-3 grid gap-3 ${isRoundTrip ? "md:grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <label className="mb-1.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6a5f86]">
                <FaCity className="text-[#B8336A]" /> {isRoundTrip ? "Aller" : "Ville"}
              </label>
              <select
                value={selectedDepartureCity}
                onChange={(e) => {
                  const city = e.target.value;
                  handleDepartureCityChange(city);
                  if (!isRoundTrip) {
                    handleReturnCityChange(city);
                  }
                }}
                className="w-full rounded-xl border border-[#dfd3e8] bg-white px-3 py-2.5 text-sm text-[#2f254b] outline-none transition focus:border-[#B8336A]"
              >
                {stationOptions.map((station) => {
                  const full = Number(station.priceExtra) || 0;
                  const half = full / 2;
                  const shownPrice = isRoundTrip ? half : full;
                  return (
                    <option key={`dep-${station.name}`} value={station.name}>
                      {station.name} (+{formatPriceNumber(shownPrice)} €)
                    </option>
                  );
                })}
              </select>
            </div>

            {isRoundTrip ? (
              <div>
                <label className="mb-1.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6a5f86]">
                  <FaCity className="text-[#B8336A]" /> Retour
                </label>
                <select
                  value={selectedReturnCity}
                  onChange={(e) => handleReturnCityChange(e.target.value)}
                  className="w-full rounded-xl border border-[#dfd3e8] bg-white px-3 py-2.5 text-sm text-[#2f254b] outline-none transition focus:border-[#B8336A]"
                >
                  {stationOptions.map((station) => {
                    const half = (Number(station.priceExtra) || 0) / 2;
                    return (
                      <option key={`ret-${station.name}`} value={station.name}>
                        {station.name} (+{formatPriceNumber(half)} €)
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-[#e8d6e2] bg-[#fff3f8] p-4">
          <div className="flex items-center justify-between text-sm font-semibold text-[#4f4567]">
            <span className="inline-flex items-center gap-2"><FaMoneyBillWave className="text-[#B8336A]" /> Séjour</span>
            <span>{baseDisplay}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm font-semibold text-[#4f4567]">
            <span className="inline-flex items-center gap-2"><FaTrain className="text-[#B8336A]" /> Transport</span>
            <span>{formatPriceNumber(transportPrice)} €</span>
          </div>
          <div className="mt-3 border-t border-[#e3c6d8] pt-3 text-base font-bold text-[#24173d]">
            <div className="flex items-center justify-between">
              <span>Total estimé</span>
              <span className="text-[#B8336A]">{totalDisplay}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleReservation}
          className="w-full cursor-pointer rounded-full bg-[#B8336A] px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#982a57]"
        >
          Estimer votre tarif
        </button>
      </div>
    </div>
  );
}
