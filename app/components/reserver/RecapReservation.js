"use client";

import { useMemo } from "react";
import Image from "next/image";
import {
  FaCalendarAlt,
  FaUserFriends,
  FaEuroSign,
  FaTrain,
} from "react-icons/fa";

/**
 * RecapReservation
 * - Calcule localement le prix du transport (si on a sejour.stations).
 * - Affiche basePrice (fourchette, etc.) pour le "Prix total" (avec astérisque).
 */
export default function RecapReservation({
  sejour,
  urlStartDate,
  urlEndDate,
  departureCity,
  returnCity,
  urlAgeGroup,
}) {
  // Convertit une date string en date FR
  function parseDateToFR(dateStr) {
    if (!dateStr) return "";
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    return dateStr;
  }

  const displayedStart = parseDateToFR(urlStartDate);
  const displayedEnd = parseDateToFR(urlEndDate);
  const displayedDates =
    displayedStart && displayedEnd
      ? `${displayedStart} au ${displayedEnd}`
      : displayedStart || "Dates non renseignées";

  // Prix "fourchette" (ou autre) lu directement dans sejour.basePrice
  const priceDisplay = sejour?.basePrice
    ? `${sejour.basePrice} €`
    : "Non défini";

  // Calcul local du transport
  // Si departureCity === returnCity => plein tarif
  // Sinon => moitiés
  const transportFee = useMemo(() => {
    if (!sejour?.stations) return 0;

    const depStation = sejour.stations.find((s) => s.name === departureCity);
    const retStation = sejour.stations.find((s) => s.name === returnCity);

    const depPrice = depStation?.priceExtra || 0;
    const retPrice = retStation?.priceExtra || 0;

    if (departureCity === returnCity) {
      return depPrice; // prix complet
    } else {
      return depPrice / 2 + retPrice / 2; // addition des moitiés
    }
  }, [departureCity, returnCity, sejour]);

  // Image du séjour ou fallback
  const imageUrl =
    sejour?.heroImage ||
    "https://via.placeholder.com/800x600.png?text=Votre+S%C3%A9jour";

  return (
    <div className="max-w-4xl mx-auto bg-white rounded shadow overflow-hidden md:flex">
      {/* Colonne infos */}
      <div className="p-4 md:p-6 md:w-1/2">
        <h2 className="text-2xl font-bold mb-4 text-[#B8336A]">
          Récapitulatif de votre réservation
        </h2>

        {/* Nom du séjour */}
        <div className="flex items-center text-gray-700 mb-2">
          <span className="w-6 h-6 inline-block mr-2 bg-[#B8336A] text-white rounded-full text-sm flex items-center justify-center font-bold">
            S
          </span>
          <p className="font-medium">{sejour?.name || "Nom du séjour"}</p>
        </div>

        {/* Dates */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaCalendarAlt className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Dates :</span> {displayedDates}
          </p>
        </div>

        {/* Aller */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaTrain className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Aller :</span>{" "}
            {departureCity || "—"}
          </p>
        </div>

        {/* Retour */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaTrain className="text-[#B8336A] mr-2 rotate-180" />
          <p>
            <span className="font-semibold">Retour :</span>{" "}
            {returnCity || "—"}
          </p>
        </div>

        {/* Tranche d'âge */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaUserFriends className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Tranche d’âge :</span>{" "}
            {urlAgeGroup ? `${urlAgeGroup} ans` : "—"}
          </p>
        </div>

        {/* Prix total (pas calculé) */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaEuroSign className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Prix total :</span> {priceDisplay}
            <sup>*</sup>
          </p>
        </div>

        {/* Transport (calcul local) */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaTrain className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Transport :</span>{" "}
            {transportFee.toFixed(2)} € {/* formatté en 2 décimales */}
          </p>
        </div>

        {/* Note sur l'astérisque */}
        <p className="text-xs mt-2 text-gray-500">
          <sup>*</sup> Le prix total sera calculé en fonction des différentes
          aides du quotient familial, des réductions, etc,
        </p>
      </div>

      {/* Colonne image */}
      <div className="relative w-full h-52 md:h-auto md:w-1/2">
        <Image
          src={imageUrl}
          alt={`Séjour : ${sejour?.name || "Image du séjour"}`}
          fill
          className="object-cover"
        />
      </div>
    </div>
  );
}
