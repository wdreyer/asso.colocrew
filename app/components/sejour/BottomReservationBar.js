"use client";

import React from "react";
import {
  FaCalendar,
  FaCity,
  FaChild,
  FaMoneyBillWave,
  FaShoppingCart,
} from "react-icons/fa";

export default function BottomReservationBar({
  sejour,
  selectedDate,
  selectedCity,
  selectedAgeGroup,
  reservationPrice,
  handleDateChange,
  handleCityChange,
  handleAgeGroupChange,
  handleReservation,
}) {
  // Préparer les options pour les dates selon le format mobile (JJ/MM - JJ/MM)
  const mobileDateOptions = sejour.dates.map((dateOption, idx) => {
    if (typeof dateOption === "object") {
      const startVal = dateOption.startDate;
      const endVal = dateOption.endDate;
      const start = new Date(startVal);
      const end = new Date(endVal);
      const label = `${start.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      })} - ${end.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      })}`;
      return (
        <option key={idx} value={startVal}>
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

  // Préparer les options pour les dates selon le format web (jour mois année au jour mois année)
  const webDateOptions = sejour.dates.map((dateOption, idx) => {
    if (typeof dateOption === "object") {
      const startVal = dateOption.startDate;
      const endVal = dateOption.endDate;
      const start = new Date(startVal);
      const end = new Date(endVal);
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
        <option key={idx} value={startVal}>
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

  return (
    <>
      {/* Version Mobile */}
      <div className="fixed inset-x-0 z-10 bottom-0  bg-gray-100 dark:bg-gray-800 p-2 shadow-lg md:hidden">
        <div className="flex flex-col md:flex-row md:justify-center md:space-x-10 md:px-8 space-y-4 md:space-y-0 items-center">
          <div className="flex md:flex-row justify-between items-center md:space-x-10 w-full">
            {/* Date */}
            <div className="flex items-center space-x-1">
              <FaCalendar className="text-[#B8336A] text-sm md:text-lg" />
              <select
                id="date-select-bottom-mobile"
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 rounded-md p-1 text-sm w-full md:w-auto md:text-base"
              >
                {mobileDateOptions}
              </select>
            </div>

            {/* Ville */}
            <div className="flex items-center space-x-1 pl-1">
              <FaCity className="text-[#B8336A] text-sm md:text-lg" />
              <select
                id="city-select-mobile"
                value={selectedCity}
                onChange={handleCityChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 rounded-md p-1 text-sm w-full"
              >
                {sejour.stations &&
                  sejour.stations.map((station) => (
                    <option key={station.name} value={station.name}>
                      {station.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Tranche d'âge */}
            <div className="flex items-center space-x-1 pl-1">
              <FaChild className="text-[#B8336A] text-sm md:text-lg" />
              <select
                id="age-group-select-bottom-mobile"
                value={selectedAgeGroup}
                onChange={handleAgeGroupChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 rounded-md p-1 text-sm w-full md:w-auto md:text-base"
              >
                {sejour.ageGroups &&
                  sejour.ageGroups.map((ageGroup, idx) => (
                    <option key={idx} value={ageGroup}>
                      {ageGroup} ans
                    </option>
                  ))}
              </select>
            </div>

            {/* Tarif et Bouton (Mobile) */}
            <div className="flex items-center space-x-1 pl-1">
              <div className="flex items-center space-x-2 whitespace-nowrap">
                <FaMoneyBillWave className="text-[#B8336A] text-sm md:text-lg" />
                <span className="whitespace-nowrap text-base md:text-lg font-semibold text-[#B8336A] dark:text-gray-200">
                  {reservationPrice} €
                </span>
              </div>
              <button
                onClick={handleReservation}
                className="px-4 py-1 bg-[#B8336A] cursor-pointer text-white rounded-md hover:bg-[#A2225A] transition duration-300 text-sm md:text-base flex items-center justify-center"
                aria-label="Réserver"
              >
                <FaShoppingCart size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Version Web */}
      <div className="fixed inset-x-0 z-10 bottom-0  bg-gray-100 dark:bg-gray-800 p-1 shadow-lg hidden md:block">
        <div className="flex flex-col md:flex-row md:justify-center md:space-x-10 md:px-8 space-y-4 md:space-y-0 items-center">
          <div className="flex md:flex-row justify-between items-center md:space-x-10 w-full">
            {/* Date */}
            <div className="flex items-center space-x-2">
              <FaCalendar className="text-[#B8336A] text-sm md:text-lg" />
              <select
                id="date-select-bottom-web"
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 rounded-md p-1 text-sm w-full md:w-auto md:text-base"
              >
                {webDateOptions}
              </select>
            </div>

            {/* Ville */}
            <div className="flex items-center space-x-2">
              <FaCity className="text-[#B8336A] text-sm md:text-lg" />
              <select
                id="city-select-web"
                value={selectedCity}
                onChange={handleCityChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 rounded-md p-1 text-sm w-full"
              >
                {sejour.stations &&
                  sejour.stations.map((station) => (
                    <option key={station.name} value={station.name}>
                      {station.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Tranche d'âge */}
            <div className="flex items-center space-x-2">
              <FaChild className="text-[#B8336A] text-sm md:text-lg" />
              <select
                id="age-group-select-bottom-web"
                value={selectedAgeGroup}
                onChange={handleAgeGroupChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 rounded-md p-1 text-sm w-full md:w-auto md:text-base"
              >
                {sejour.ageGroups &&
                  sejour.ageGroups.map((ageGroup, idx) => (
                    <option key={idx} value={ageGroup}>
                      {ageGroup} ans
                    </option>
                  ))}
              </select>
            </div>

            {/* Tarif */}
            <div className="flex items-center space-x-2">
              <FaMoneyBillWave className="text-[#B8336A] text-sm md:text-lg" />
              <span className="text-base md:text-lg font-semibold text-[#B8336A] dark:text-gray-200">
                {reservationPrice} €
              </span>
            </div>

            {/* Bouton Réserver */}
            <div className="flex justify-center md:justify-start w-full md:w-auto">
              <button
                onClick={handleReservation}
                className="w-full font-poppins md:w-auto bg-[#B8336A] cursor-pointer text-white px-6 py-2 rounded-md hover:bg-[#A2225A] transition duration-300 text-sm md:text-base"
              >
                Réserver
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
