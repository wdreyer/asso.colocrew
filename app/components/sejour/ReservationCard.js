"use client";

import React from "react";
import {
  FaCalendar,
  FaCity,
  FaChild,
  FaMoneyBillWave,
  FaTrain,
} from "react-icons/fa";

// Petit util pour afficher des prix propres
function formatPrice(value) {
  const rounded = Math.round(value * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
}

export default function ReservationCard({
  sejour,
  selectedDate,
  selectedAgeGroup,
  reservationPrice,
  handleDateChange,
  handleAgeGroupChange,
  handleReservation,

  // Transport
  isRoundTrip,
  handleRoundTripChange,
  selectedDepartureCity,
  selectedReturnCity,
  handleDepartureCityChange,
  handleReturnCityChange,
}) {
  // Calcul local du transport, si on veut l'afficher ici (optionnel).
  // Sinon, on peut l'omettre si tu n'en as pas besoin.
  const computeTransportPrice = () => {
    if (!sejour || !sejour.stations) return 0;

    if (!isRoundTrip) {
      // Aller simple
      const station = sejour.stations.find(
        (s) => s.name === selectedDepartureCity
      );
      return station ? station.priceExtra : 0;
    } else {
      // Aller-retour
      if (selectedDepartureCity === selectedReturnCity) {
        const station = sejour.stations.find(
          (s) => s.name === selectedDepartureCity
        );
        return station ? station.priceExtra : 0;
      } else {
        const dep = sejour.stations.find(
          (s) => s.name === selectedDepartureCity
        );
        const ret = sejour.stations.find(
          (s) => s.name === selectedReturnCity
        );
        const depPrice = dep ? dep.priceExtra : 0;
        const retPrice = ret ? ret.priceExtra : 0;
        return depPrice / 2 + retPrice / 2;
      }
    }
  };
  const computedTransportPrice = computeTransportPrice();

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md shadow space-y-4">
      <div className="space-y-3">
        {/* Date */}
        <div className="flex items-center">
          <div className="w-1/3 flex items-center">
            <FaCalendar className="mr-2 text-[#B8336A] text-lg" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Date
            </span>
          </div>
          <div className="w-2/3">
            <select
              value={selectedDate}
              onChange={handleDateChange}
              className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 p-2 text-sm"
            >
              {sejour.dates.map((dateOption, idx) => {
                if (typeof dateOption === "object") {
                  const { startDate, endDate } = dateOption;
                  const start = new Date(startDate);
                  const end = new Date(endDate);
                  const label = `${start.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })} au ${end.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}`;
                  return (
                    <option key={idx} value={startDate}>
                      {label}
                    </option>
                  );
                } else {
                  const asDate = new Date(dateOption);
                  let label = dateOption;
                  if (!isNaN(asDate.getTime())) {
                    label = asDate.toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    });
                  }
                  return (
                    <option key={idx} value={dateOption}>
                      {label}
                    </option>
                  );
                }
              })}
            </select>
          </div>
        </div>

        {/* Toggle Aller/Retour */}
        <div className="w-full">
          <label htmlFor="roundTripToggle" className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="roundTripToggle"
              checked={isRoundTrip}
              onChange={(e) => handleRoundTripChange(e.target.checked)}
              className="h-4 w-4 text-[#B8336A] border-gray-300 rounded"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300 w-full">
              Aller et Retour différents
            </span>
          </label>
        </div>

        {/* Ville(s) */}
        {isRoundTrip ? (
          <>
            {/* Ville Aller */}
            <div className="flex items-center">
              <div className="w-1/3 flex items-center">
                <FaCity className="mr-2 text-[#B8336A] text-lg" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Aller
                </span>
              </div>
              <div className="w-2/3">
                <select
                  value={selectedDepartureCity}
                  onChange={(e) => handleDepartureCityChange(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 p-2 text-sm"
                >
                  {sejour.stations?.map((station) => {
                    const halfPrice = (station.priceExtra || 0) / 2;
                    return (
                      <option key={station.name} value={station.name}>
                        {station.name} ({formatPrice(halfPrice)} €)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Ville Retour */}
            <div className="flex items-center">
              <div className="w-1/3 flex items-center">
                <FaCity className="mr-2 text-[#B8336A] text-lg" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Retour
                </span>
              </div>
              <div className="w-2/3">
                <select
                  value={selectedReturnCity}
                  onChange={(e) => handleReturnCityChange(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 p-2 text-sm"
                >
                  {sejour.stations?.map((station) => {
                    const halfPrice = (station.priceExtra || 0) / 2;
                    return (
                      <option key={station.name} value={station.name}>
                        {station.name} ({formatPrice(halfPrice)} €)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </>
        ) : (
          // Ville unique
          <div className="flex items-center">
            <div className="w-1/3 flex items-center">
              <FaCity className="mr-2 text-[#B8336A] text-lg" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Ville
              </span>
            </div>
            <div className="w-2/3">
              <select
                value={selectedDepartureCity}
                onChange={(e) => handleDepartureCityChange(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 p-2 text-sm"
              >
                {sejour.stations?.map((station) => {
                  const fullPrice = station.priceExtra || 0;
                  return (
                    <option key={station.name} value={station.name}>
                      {station.name} ({formatPrice(fullPrice)} €)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}

        {/* Age */}
        <div className="flex items-center">
          <div className="w-1/3 flex items-center">
            <FaChild className="mr-2 text-[#B8336A] text-lg" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Age
            </span>
          </div>
          <div className="w-2/3">
            <select
              value={selectedAgeGroup}
              onChange={handleAgeGroupChange}
              className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 p-2 text-sm"
            >
              {sejour.ageGroups?.map((ageGroup, idx) => (
                <option key={idx} value={ageGroup}>
                  {ageGroup} ans
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Transport (facultatif) */}
        <div className="flex items-center">
          <div className="w-1/3 flex items-center">
            <FaTrain className="mr-2 text-[#B8336A] text-lg" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Transport
            </span>
          </div>
          <div className="w-2/3 text-right">
            <p className="text-xs text-gray-700 dark:text-gray-200">
              <span className="text-base font-semibold text-[#B8336A] dark:text-gray-200">
                {formatPrice(computedTransportPrice)} €
              </span>
            </p>
          </div>
        </div>

        {/* Tarif */}
        <div className="flex items-center">
          <div className="w-1/3 flex items-center">
            <FaMoneyBillWave className="mr-2 text-[#B8336A] text-lg" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Tarif
            </span>
          </div>
          <div className="w-2/3 text-right">
            <p className="text-xs text-gray-700 dark:text-gray-200">
              <span className="text-base font-semibold text-[#B8336A] dark:text-gray-200">
                {reservationPrice} €*
              </span>
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-700 dark:text-gray-300 w-full">*Chez Colocrew les prix sont calculés suivant les différentes aides, QF, et autres ... </span>

      </div>

      {/* Bouton Réserver */}
      <div className="mt-4">
        <button
          onClick={handleReservation}
          className="w-full bg-[#B8336A] cursor-pointer text-white px-6 py-2 rounded-md hover:bg-[#A2225A] transition duration-300 text-sm md:text-base"
        >
          Réserver
        </button>
      </div>
    </div>
  );
}
