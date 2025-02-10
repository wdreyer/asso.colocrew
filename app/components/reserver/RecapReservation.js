"use client";

import Image from "next/image";
import {
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUserFriends,
  FaEuroSign,
} from "react-icons/fa";

/**
 * Affiche un récapitulatif en gérant DEUX dates : urlStartDate, urlEndDate
 */
export default function RecapReservation({
  sejour,
  urlStartDate,
  urlEndDate,
  urlCity,
  urlAgeGroup,
  basePrice,
  computedTotalPrice,
}) {
  // Image du séjour ou fallback
  const imageUrl =
    sejour?.heroImage ||
    "https://via.placeholder.com/800x600.png?text=Votre+S%C3%A9jour";

  // Petite fonction pour parser la date en FR
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
    // Si la chaîne n'est pas une date valide, on la renvoie telle quelle
    return dateStr;
  }

  // On combine start et end en une seule chaîne si les deux existent
  const displayedStart = parseDateToFR(urlStartDate);
  const displayedEnd = parseDateToFR(urlEndDate);

  let displayedDates = displayedStart;
  if (displayedStart && displayedEnd) {
    displayedDates = `${displayedStart} au ${displayedEnd}`;
  }

  return (
    <div className="max-w-4xl mx-auto bg-white rounded shadow overflow-hidden md:flex">
      {/* Colonne gauche : Infos */}
      <div className="p-4 md:p-6 md:w-1/2">
        <h2 className="text-2xl font-bold mb-4 text-[#B8336A]">
          Récapitulatif de votre réservation
        </h2>

        {/* Nom du séjour */}
        <div className="flex items-center text-gray-700 mb-2">
          <span className="w-6 h-6 inline-block mr-2 bg-[#B8336A] text-white rounded-full text-sm flex items-center justify-center font-bold">
            S
          </span>
          <p className="font-medium">{sejour?.name}</p>
        </div>

        {/* Dates de séjour */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaCalendarAlt className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Dates :</span>{" "}
            {displayedDates || "Non renseignées"}
          </p>
        </div>

        {/* Ville de départ */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaMapMarkerAlt className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Ville de départ :</span> {urlCity}
          </p>
        </div>

        {/* Tranche d'âge */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaUserFriends className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Tranche d’âge :</span> {urlAgeGroup} ans
          </p>
        </div>

        {/* Prix total */}
        <div className="flex items-center text-gray-700 mb-2">
          <FaEuroSign className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Prix total :</span>{" "}
            {computedTotalPrice} €
          </p>
        </div>
      </div>

      {/* Colonne droite : Image */}
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
