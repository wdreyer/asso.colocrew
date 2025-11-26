"use client";

import React from "react";
import {
  FaCalendar,
  FaCity,
  FaChild,
  FaMoneyBillWave,
  FaShoppingCart,
  FaTrain,
} from "react-icons/fa";

/**
 * BottomReservationBar :
 * Synchronise l'A/R (isRoundTrip), villes aller/retour, date, etc.
 */
export default function BottomReservationBar({
  // Props du parent
  sejour,
  selectedDate,
  selectedAgeGroup,
  reservationPrice,
  transportPrice,
  handleDateChange,
  handleAgeGroupChange,
  handleReservation,

  // Transport
  isRoundTrip,
  onRoundTripChange,
  selectedDepartureCity,
  selectedReturnCity,
  onDepartureCityChange,
  onReturnCityChange,
}) {
  // ----------------------------------------
  // Génération des <option> pour les dates
  // ----------------------------------------
  const mobileDateOptions = sejour.dates.map((dateOption, idx) => {
    if (typeof dateOption === "object") {
      const { startDate, endDate } = dateOption;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const label = `${start.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      })} - ${end.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      })}`;
      return (
        <option key={idx} value={startDate}>
          {label}
        </option>
      );
    } else {
      const asDate = new Date(dateOption);
      const label = !isNaN(asDate.getTime())
        ? asDate.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
          })
        : dateOption;
      return (
        <option key={idx} value={dateOption}>
          {label}
        </option>
      );
    }
  });

  const webDateOptions = sejour.dates.map((dateOption, idx) => {
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
      const label = !isNaN(asDate.getTime())
        ? asDate.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : dateOption;
      return (
        <option key={idx} value={dateOption}>
          {label}
        </option>
      );
    }
  });

  // ----------------------------------------
  // Fonctions locales pour la cohérence
  // ----------------------------------------
  const handleRoundTripToggle = (checked) => {
    onRoundTripChange(checked);
    // Si on vient de décocher => on force la ville retour = ville départ
    if (!checked) {
      onReturnCityChange(selectedDepartureCity);
    }
  };

  const handleDepartureCityChangeLocal = (city) => {
    onDepartureCityChange(city);
    // Si on n'est pas en A/R différent => forcer la même ville
    if (!isRoundTrip) {
      onReturnCityChange(city);
    }
  };

  return (
    <>
      {/* Version Mobile : barre compacte (~20% hauteur) */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-gray-100 dark:bg-gray-900 px-2 py-2 shadow-lg md:hidden">
        <div className="flex flex-col space-y-1 text-xs text-gray-800 dark:text-gray-100">
          {/* Ligne 1 : Date + Âge */}
          <div className="flex items-center justify-between space-x-2">
            {/* Date */}
            <div className="flex items-center flex-1 min-w-0 space-x-1">
              <FaCalendar className="text-[#B8336A] text-sm flex-shrink-0" />
              <select
                value={selectedDate}
                onChange={handleDateChange}
                className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-1 text-[11px] leading-tight"
              >
                {mobileDateOptions}
              </select>
            </div>

            {/* Âge */}
            <div className="flex items-center flex-[0.7] min-w-[90px] space-x-1">
              <FaChild className="text-[#B8336A] text-sm flex-shrink-0" />
              <select
                value={selectedAgeGroup}
                onChange={handleAgeGroupChange}
                className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-1 text-[11px] leading-tight"
              >
                {sejour.ageGroups?.map((ageGroup, idx) => (
                  <option key={idx} value={ageGroup}>
                    {ageGroup} ans
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ligne 2 : A/R + villes */}
          <div className="flex items-center justify-between space-x-2">
            {/* Toggle A/R différents */}
            <label className="flex items-center space-x-1 flex-[0.9]">
              <input
                type="checkbox"
                checked={isRoundTrip}
                onChange={(e) => handleRoundTripToggle(e.target.checked)}
                className="h-3 w-3 text-[#B8336A] border-gray-300 rounded"
              />
              <span className="text-[11px] leading-tight">
                A/R différents
              </span>
            </label>

            {/* Villes */}
            {!isRoundTrip ? (
              // Ville unique
              <div className="flex items-center flex-[1.6] space-x-1">
                <FaCity className="text-[#B8336A] text-sm flex-shrink-0" />
                <select
                  value={selectedDepartureCity}
                  onChange={(e) =>
                    handleDepartureCityChangeLocal(e.target.value)
                  }
                  className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-1 text-[11px] leading-tight"
                >
                  {sejour.stations?.map((station) => (
                    <option key={station.name} value={station.name}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              // Aller + retour
              <div className="flex items-center flex-[1.6] space-x-1">
                {/* Aller */}
                <div className="flex items-center flex-1 space-x-1">
                  <span className="text-[10px]">Aller</span>
                  <FaCity className="text-[#B8336A] text-xs flex-shrink-0" />
                  <select
                    value={selectedDepartureCity}
                    onChange={(e) =>
                      handleDepartureCityChangeLocal(e.target.value)
                    }
                    className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-1 text-[10px] leading-tight"
                  >
                    {sejour.stations?.map((station) => {
                      const half = (station.priceExtra || 0) / 2;
                      return (
                        <option key={station.name} value={station.name}>
                          {station.name} ({half}€)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Retour */}
                <div className="flex items-center flex-1 space-x-1">
                  <span className="text-[10px]">Retour</span>
                  <FaCity className="text-[#B8336A] text-xs flex-shrink-0" />
                  <select
                    value={selectedReturnCity}
                    onChange={(e) => onReturnCityChange(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-1 text-[10px] leading-tight"
                  >
                    {sejour.stations?.map((station) => {
                      const half = (station.priceExtra || 0) / 2;
                      return (
                        <option key={station.name} value={station.name}>
                          {station.name} ({half}€)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Ligne 3 : tarifs + bouton */}
          <div className="flex items-center justify-between space-x-2 pt-1">
            {/* Prix */}
            <div className="flex flex-col flex-1 space-y-[2px]">
              <div className="flex items-center space-x-1">
                <FaTrain className="text-[#B8336A] text-xs" />
                <span className="text-[11px] leading-tight">
                  Transport :{" "}
                  <span className="font-semibold text-[#B8336A]">
                    {transportPrice} €
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <FaMoneyBillWave className="text-[#B8336A] text-xs" />
                <span className="text-[11px] leading-tight">
                  Tarif :{" "}
                  <span className="font-semibold text-[#B8336A]">
                    {reservationPrice} €*
                  </span>
                </span>
              </div>
              <span className="text-[9px] text-gray-600 dark:text-gray-300">
                *Chez Colocrew, les prix tiennent compte des aides, QF, etc.
              </span>
            </div>

            {/* Bouton */}
            <button
              onClick={handleReservation}
              className="flex items-center justify-center flex-[0.9]
                         bg-[#B8336A] text-white rounded-md px-3 py-2
                         text-[11px] font-medium cursor-pointer
                         hover:bg-[#A2225A] transition duration-300"
            >
              <FaShoppingCart size={14} className="mr-1" />
              Estimer
            </button>
          </div>
        </div>
      </div>

      {/* Version Web (inchangée) */}
      <div className="fixed inset-x-0 z-10 bottom-0 bg-gray-100 dark:bg-gray-800 p-2 shadow-lg hidden md:block">
        <div className="flex items-center justify-between mx-4">
          {/* Bloc de gauche : Date, case A/R, villes, âge */}
          <div className="flex items-center space-x-4">
            {/* Date */}
            <div className="flex items-center space-x-2">
              <FaCalendar className="text-[#B8336A] text-sm md:text-lg" />
              <select
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-white w-48 text-gray-900 dark:bg-gray-700 dark:text-gray-100
                           border border-gray-300 rounded-md p-1 text-sm md:text-base"
              >
                {webDateOptions}
              </select>
            </div>

            {/* Checkbox A/R */}
            <div className="flex items-center space-x-2">
              <input
                id="arDifferents"
                type="checkbox"
                className="h-4 w-4 text-[#B8336A] border-gray-300 rounded"
                checked={isRoundTrip}
                onChange={(e) => handleRoundTripToggle(e.target.checked)}
              />
              <label
                htmlFor="arDifferents"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                A/R différents
              </label>
            </div>

            {/* Villes */}
            {!isRoundTrip ? (
              // Ville unique
              <div className="flex items-center space-x-2">
                <FaCity className="text-[#B8336A] text-sm md:text-lg" />
                <select
                  value={selectedDepartureCity}
                  onChange={(e) =>
                    handleDepartureCityChangeLocal(e.target.value)
                  }
                  className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                             border border-gray-300 rounded-md p-1 text-sm md:text-base"
                >
                  {sejour.stations?.map((station) => (
                    <option key={station.name} value={station.name}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              // Aller + retour
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <span className="text-xs md:text-sm text-black dark:text-black">
                    Aller
                  </span>
                  <FaCity className="text-[#B8336A] text-sm md:text-lg" />
                  <select
                    value={selectedDepartureCity}
                    onChange={(e) =>
                      handleDepartureCityChangeLocal(e.target.value)
                    }
                    className="bg-white w-24 text-gray-900 dark:bg-gray-700 dark:text-gray-100
                               border border-gray-300 rounded-md p-1 text-sm md:text-base"
                  >
                    {sejour.stations?.map((station) => {
                      const half = (station.priceExtra || 0) / 2;
                      return (
                        <option key={station.name} value={station.name}>
                          {station.name} ({half}€)
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-xs md:text-sm text-black dark:text-black">
                    Retour
                  </span>
                  <FaCity className="text-[#B8336A] text-sm md:text-lg" />
                  <select
                    value={selectedReturnCity}
                    onChange={(e) => onReturnCityChange(e.target.value)}
                    className="bg-white w-24 text-gray-900 dark:bg-gray-700 dark:text-gray-100
                               border border-gray-300 rounded-md p-1 text-sm md:text-base"
                  >
                    {sejour.stations?.map((station) => {
                      const half = (station.priceExtra || 0) / 2;
                      return (
                        <option key={station.name} value={station.name}>
                          {station.name} ({half}€)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}

            {/* Âge */}
            <div className="flex items-center space-x-2">
              <FaChild className="text-[#B8336A] text-sm md:text-lg" />
              <select
                value={selectedAgeGroup}
                onChange={handleAgeGroupChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                           border border-gray-300 rounded-md p-1 text-sm md:text-base"
              >
                {sejour.ageGroups?.map((ageGroup, idx) => (
                  <option key={idx} value={ageGroup}>
                    {ageGroup} ans
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bloc de droite : Transport, Tarif, Bouton réserver */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FaTrain className="text-[#B8336A] text-sm md:text-lg" />
              <span className="text-base md:text-lg font-semibold text-[#B8336A] dark:text-gray-200">
                {transportPrice} €
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <FaMoneyBillWave className="text-[#B8336A] text-sm md:text-lg" />
              <span className="text-base md:text-lg font-semibold text-[#B8336A] dark:text-gray-200">
                {reservationPrice} €
              </span>
            </div>
            <button
              onClick={handleReservation}
              className="bg-[#B8336A] text-white cursor-pointer rounded-md hover:bg-[#A2225A] transition
                         duration-300 text-sm md:text-base py-2 px-4"
            >
              Estimer votre tarif
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
