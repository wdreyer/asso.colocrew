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
      {/* Version Mobile */}
      <div className="fixed inset-x-0 z-10 bottom-0 bg-gray-100 dark:bg-gray-800 p-2 shadow-lg md:hidden">
        <div className="flex flex-col space-y-4 items-center">
          {/* Ligne 1 : Date, A/R diff, Age */}
          <div className="flex flex-wrap items-center justify-between w-full space-y-2">
            {/* Date */}
            <div className="flex items-center space-x-1">
              <FaCalendar className="text-[#B8336A] text-sm" />
              <select
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                           border border-gray-300 rounded-md p-1 text-sm w-18"
              >
                {mobileDateOptions}
              </select>
            </div>

            {/* A/R différents */}
            <div className="flex items-center space-x-1">
              <input
                type="checkbox"
                id="roundtrip-toggle-mobile"
                className="h-4 w-4 text-[#B8336A] border-gray-300 rounded"
                checked={isRoundTrip}
                onChange={(e) => handleRoundTripToggle(e.target.checked)}
              />
              <label
                htmlFor="roundtrip-toggle-mobile"
                className="text-xs text-gray-700 dark:text-gray-300"
              >
                A/R diff
              </label>
            </div>

            {/* Tranche d'âge */}
            <div className="flex items-center space-x-1">
              <FaChild className="text-[#B8336A] text-sm" />
              <select
                value={selectedAgeGroup}
                onChange={handleAgeGroupChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                           border border-gray-300 rounded-md p-1 text-sm w-20"
              >
                {sejour.ageGroups?.map((ageGroup, idx) => (
                  <option key={idx} value={ageGroup}>
                    {ageGroup} ans
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ligne 2 : ville unique OU aller/retour */}
          {!isRoundTrip ? (
            // Ville unique
            <div className="flex items-center space-x-1 w-full justify-center">
              <FaCity className="text-[#B8336A] text-sm" />
              <select
                value={selectedDepartureCity}
                onChange={(e) => handleDepartureCityChangeLocal(e.target.value)}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                           border border-gray-300 rounded-md p-1 text-sm w-32"
              >
                {sejour.stations?.map((station) => (
                  <option key={station.name} value={station.name}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            // 2 selects : aller + retour
            <div className="flex flex-col space-y-1 w-full">
              {/* Aller */}
              <div className="flex items-center space-x-1">
                <FaCity className="text-[#B8336A] text-sm" />
                <select
                  value={selectedDepartureCity}
                  onChange={(e) =>
                    handleDepartureCityChangeLocal(e.target.value)
                  }
                  className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                             border border-gray-300 rounded-md p-1 text-sm w-32"
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
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Aller
                </span>
              </div>
              {/* Retour */}
              <div className="flex items-center space-x-1">
                <FaCity className="text-[#B8336A] text-sm" />
                <select
                  value={selectedReturnCity}
                  onChange={(e) => onReturnCityChange(e.target.value)}
                  className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                             border border-gray-300 rounded-md p-1 text-sm w-32"
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
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Retour
                </span>
              </div>
            </div>
          )}

          {/* Ligne 3 : tarif + transport + bouton Réserver */}
          <div className="flex flex-col items-center space-y-1 w-full">
            <div className="flex items-center space-x-2">
              <FaMoneyBillWave className="text-[#B8336A] text-sm" />
              <span className="text-base font-semibold text-[#B8336A] dark:text-gray-200">
                {reservationPrice} €
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <FaTrain className="text-[#B8336A] text-sm" />
              <span className="text-sm md:text-base text-gray-500 dark:text-gray-400">
                Transport : {transportPrice} €
              </span>
            </div>
            <button
              onClick={handleReservation}
              className="w-full px-4 cursor-pointer py-1 bg-[#B8336A] text-white rounded-md
                         hover:bg-[#A2225A] transition duration-300 text-sm md:text-base
                         flex items-center justify-center"
            >
              <FaShoppingCart size={20} className="mr-1" />
              Estimer votre tarif            </button>
          </div>
        </div>
      </div>

      {/* Version Web */}
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
