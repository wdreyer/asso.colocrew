"use client";

import React from "react";
import {
  FaCalendar,
  FaCity,
  FaChild,
  FaMoneyBillWave
} from "react-icons/fa";

export default function ReservationCard({
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
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md shadow">
      <div className="flex flex-col space-y-4">
        {/* Date */}
        <div className="flex items-center space-x-2">
          <FaCalendar className="text-[#B8336A] text-lg" />
          <select
            id="date-select"
            value={selectedDate}
            onChange={handleDateChange}
            className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100
                       border border-gray-300 rounded-md p-1 text-sm w-full"
          >
            {sejour.dates.map((dateOption, idx) => {
              // Si c'est un objet { startDate, endDate }, on garde 'startDate' en value
              if (typeof dateOption === "object") {
                const startVal = dateOption.startDate; 
                const endVal = dateOption.endDate;

                // Pour l'affichage, on parse la date sans altérer l'original
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
                // Si c'est juste une string (ex: "2025-08-15")
                // On la garde telle quelle en value
                // On peut faire un toLocaleDateString pour l'affichage si on sait que c'est un format ISO
                let label = dateOption;
                // Optionnel: si c'est un format ISO, on parse juste pour un affichage lisible
                const asDate = new Date(dateOption);
                if (!isNaN(asDate.getTime())) {
                  // Format FR
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

        {/* Ville */}
        <div className="flex items-center space-x-2">
          <FaCity className="text-[#B8336A] text-lg" />
          <select
            id="city-select"
            value={selectedCity}
            onChange={handleCityChange}
            className="bg-white text-gray-900 dark:bg-gray-700
                       dark:text-gray-100 border border-gray-300
                       rounded-md p-1 text-sm w-full"
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
          <FaChild className="text-[#B8336A] text-lg" />
          <select
            id="age-group-select"
            value={selectedAgeGroup}
            onChange={handleAgeGroupChange}
            className="bg-white text-gray-900 dark:bg-gray-700
                       dark:text-gray-100 border border-gray-300
                       rounded-md p-1 text-sm w-full"
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
          <FaMoneyBillWave className="text-[#B8336A] text-lg" />
          <span className="text-base font-semibold text-[#B8336A] dark:text-gray-200">
            {reservationPrice} €
          </span>
        </div>

        {/* Bouton Réserver */}
        <button
          onClick={handleReservation}
          className="w-full font-poppins md:w-auto bg-[#B8336A] cursor-pointer
                     text-white px-6 py-2 rounded-md hover:bg-[#A2225A]
                     transition duration-300 text-sm md:text-base"
        >
          Réserver
        </button>
      </div>
    </div>
  );
}
