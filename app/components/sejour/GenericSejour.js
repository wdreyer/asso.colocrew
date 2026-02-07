"use client";

import React from "react";
import Image from "next/image";
import {
  FaSave,
  FaPlus,
  FaTrash,
  FaUpload,
  FaLandmark,
  FaShip,
  FaTrain,
  FaBed,
  FaUtensils,
  FaMagic,
  FaTree,
  FaCampground,
  FaWater,
  FaUsers,
  FaPaintBrush,
  FaBus,
  FaBicycle,
  FaCar,
  FaPlane,
  FaWalking,
  FaSkiing,
  FaSkating,
  FaSubway,
  FaMotorcycle,
  FaHiking,
  FaHeart,
  FaSmile,
  FaStar,
  FaCrown,
  FaQuestion,
  FaCalendar, 
  FaChild,
  FaMoneyBillWave
} from "react-icons/fa";

// Mapping des icônes disponibles sur une seule ligne
const iconMap = { FaSave, FaPlus, FaTrash, FaUpload, FaLandmark, FaShip, FaTrain, FaBed, FaUtensils, FaMagic, FaTree, FaCampground, FaWater, FaUsers, FaPaintBrush, FaBus, FaBicycle, FaCar, FaPlane, FaWalking, FaSkiing, FaSkating, FaSubway, FaMotorcycle, FaHiking, FaHeart, FaSmile, FaStar, FaCrown, FaQuestion, FaCalendar, FaChild, FaMoneyBillWave };

// Composant pour afficher un badge d'information (utilisé en haut à droite)
const InfoBadge = ({ icon: Icon, text }) => (
  <div className="flex items-center bg-[#281C47] font-bold text-white text-sm px-2 py-1 rounded">
    <Icon className="mr-1" />
    <span>{text}</span>
  </div>
);

export default function GenericSejour({ sejourData, sejourSlug }) {
  if (!sejourData) {
    return <div className="text-center p-8">Aucune donnée de séjour disponible.</div>;
  }

  const { basePrice, name, heroImage, heroSubtitle, icons, dates, ageGroups } = sejourData;
  const sejourId = (
    sejourSlug ||
    sejourData?.urlSejour ||
    sejourData?.slug ||
    sejourData?.id ||
    sejourData?.name ||
    ""
  )
    .toString()
    .toLowerCase();
  const isSkiAndMusic =
    sejourId.includes("ski") &&
    (sejourId.includes("music") || sejourId.includes("musique"));
  const spotsRaw =
    sejourData?.spotsLeft ?? sejourData?.placesLeft ?? sejourData?.remainingSpots;
  const spotsNumber =
    typeof spotsRaw === "number" ? spotsRaw : Number(spotsRaw);
  const spotsText =
    Number.isFinite(spotsNumber) && spotsNumber > 0
      ? `${spotsNumber} place${spotsNumber > 1 ? "s" : ""}`
      : "quelques places";

  // Fonction pour extraire tous les mois uniques des dates
  const getFormattedMonthRange = () => {
    if (!dates || dates.length === 0) return "";
    const months = dates.flatMap((d) => {
      if (d?.startDate && d?.endDate) {
        return [
          new Date(d.startDate).toLocaleDateString("fr-FR", { month: "long" }),
          new Date(d.endDate).toLocaleDateString("fr-FR", { month: "long" }),
        ];
      }
      return [];
    });
    const uniqueMonths = [...new Set(months)];
    return uniqueMonths.join(" - ");
  };

  // Fonction qui calcule la durée totale en jours
  const getDuration = () => {
    const d = dates?.[0];
    if (d?.startDate && d?.endDate) {
      const start = new Date(d.startDate);
      const end = new Date(d.endDate);
      return `${Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1} jours`;
    }
    return "";
  };

  return (
    <section className="relative">
      {/* Image principale */}
      <div className="relative w-full h-[40vh] sm:h-[35vh] overflow-hidden">
        <Image
          src={heroImage}
          alt={name}
          fill
          style={{ objectFit: "cover" }}
          className="w-full h-full"
        />

        

        {/* Bandeaux d'informations en haut à droite */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <InfoBadge icon={FaCalendar} text={getFormattedMonthRange()} />
          <InfoBadge
            icon={FaChild}
            text={
              ageGroups?.length
                ? `${ageGroups[0]}${ageGroups[1] ? " - " + ageGroups[1] : ""} ans`
                : ""
            }
          />
          <InfoBadge icon={FaCalendar} text={getDuration()} />
          <InfoBadge icon={FaMoneyBillWave} text={`${basePrice} €`} />
        </div>

        {/* Titre et sous-titre en bas à gauche */}
        <div className="absolute bottom-4 left-4">
          {isSkiAndMusic && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/90 text-[#B8336A] px-3 py-1 text-base md:text-lg font-extrabold shadow">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#B8336A] animate-pulse"></span>
              Plus que {spotsText}
            </div>
          )}
          <h1 className="text-3xl md:text-5xl font-black text-white">{name}</h1>
          {heroSubtitle && (
            <p className="mt-1 text-white text-sm md:text-lg font-bold">{heroSubtitle}</p>
          )}
        </div>
      </div>
    </section>
  );
}
