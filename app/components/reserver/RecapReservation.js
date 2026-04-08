"use client";

import { useMemo } from "react";
import Image from "next/image";
import { FaCalendarAlt, FaEuroSign, FaTrain, FaUserFriends } from "react-icons/fa";
import { formatPriceNumber, formatPriceRange, resolveSejourPriceRange } from "@/src/lib/pricing";

export default function RecapReservation({
  sejour,
  urlStartDate,
  urlEndDate,
  departureCity,
  returnCity,
  urlAgeGroup,
}) {
  function parseDateToFR(dateStr) {
    if (!dateStr) return "";
    const parsedDate = new Date(dateStr);
    if (!Number.isNaN(parsedDate.getTime())) {
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

  const selectedPriceRange = resolveSejourPriceRange(sejour, urlStartDate);
  const hasPriceRange = selectedPriceRange.min > 0 || selectedPriceRange.max > 0;
  const priceDisplay = hasPriceRange ? formatPriceRange(selectedPriceRange) : "Non défini";

  const transportFee = useMemo(() => {
    if (!sejour?.stations) return 0;

    const depStation = sejour.stations.find((s) => s.name === departureCity);
    const retStation = sejour.stations.find((s) => s.name === returnCity);
    const depPrice = Number(depStation?.priceExtra) || 0;
    const retPrice = Number(retStation?.priceExtra) || 0;

    if (departureCity === returnCity) return depPrice;
    return depPrice / 2 + retPrice / 2;
  }, [departureCity, returnCity, sejour]);

  const imageUrl =
    sejour?.heroImage ||
    "https://via.placeholder.com/800x600.png?text=Votre+Sejour";

  return (
    <div className="max-w-4xl mx-auto bg-white rounded shadow overflow-hidden md:flex">
      <div className="p-4 md:p-6 md:w-1/2">
        <h2 className="text-2xl font-bold mb-4 text-[#B8336A]">
          Récapitulatif de votre réservation
        </h2>

        <div className="flex items-center text-gray-700 mb-2">
          <span className="w-6 h-6 inline-block mr-2 bg-[#B8336A] text-white rounded-full text-sm flex items-center justify-center font-bold">
            S
          </span>
          <p className="font-medium">{sejour?.name || "Nom du séjour"}</p>
        </div>

        <div className="flex items-center text-gray-700 mb-2">
          <FaCalendarAlt className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Dates :</span> {displayedDates}
          </p>
        </div>

        <div className="flex items-center text-gray-700 mb-2">
          <FaTrain className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Aller :</span> {departureCity || "—"}
          </p>
        </div>

        <div className="flex items-center text-gray-700 mb-2">
          <FaTrain className="text-[#B8336A] mr-2 rotate-180" />
          <p>
            <span className="font-semibold">Retour :</span> {returnCity || "—"}
          </p>
        </div>

        <div className="flex items-center text-gray-700 mb-2">
          <FaUserFriends className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Tranche d’âge :</span>{" "}
            {urlAgeGroup ? `${urlAgeGroup} ans` : "—"}
          </p>
        </div>

        <div className="flex items-center text-gray-700 mb-2">
          <FaEuroSign className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Prix total :</span> {priceDisplay}
            <sup>*</sup>
          </p>
        </div>

        <div className="flex items-center text-gray-700 mb-2">
          <FaTrain className="text-[#B8336A] mr-2" />
          <p>
            <span className="font-semibold">Transport :</span>{" "}
            {formatPriceNumber(transportFee)} €
          </p>
        </div>

        <p className="text-xs mt-2 text-gray-500">
          <sup>*</sup> Le prix total sera calculé en fonction des aides, des réductions et des
          options choisies.
        </p>
      </div>

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

