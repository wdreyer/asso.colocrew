"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  FaWater,
  FaCity,
  FaTree,
  FaCalendarAlt,
  FaUserFriends,
  FaClock,
} from "react-icons/fa";
import { GiMountainCave } from "react-icons/gi";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase";
import Spinner from "../components/layout/Spinner";

export default function SejoursList() {
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedEnvironment, setSelectedEnvironment] = useState("all");
  const [selectedAgeGroups, setSelectedAgeGroups] = useState(["6-10", "11-13", "14-17"]);
  const [sejours, setSejours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableMonths, setAvailableMonths] = useState([]);

  const monthOrder = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];

  useEffect(() => {
    async function fetchSejours() {
      try {
        const querySnapshot = await getDocs(collection(db, "sejours"));
        const docs = [];
        const monthsSet = new Set();

        querySnapshot.forEach((docSnap) => {
          let data = docSnap.data();
          let displayMonths = new Set();

          if (data.dates && data.dates.length > 0) {
            data.dates.forEach((dateObj) => {
              if (dateObj.startDate && dateObj.endDate) {
                const start = new Date(dateObj.startDate);
                const monthName = start.toLocaleDateString("fr-FR", { month: "long" });
                // On formate avec la première lettre en majuscule
                const formattedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                displayMonths.add(formattedMonth);
              }
            });
            data.displayMonths = Array.from(displayMonths);
            data.period = data.displayMonths.join(", ");
            data.displayMonths.forEach((m) => monthsSet.add(m));
          } else {
            data.displayMonths = [];
            data.period = "";
          }

          let environment = "inconnu";
          const idLower = docSnap.id.toLowerCase();
          if (idLower.includes("surf")) environment = "mer";
          else if (idLower.includes("ski")) environment = "montagne";
          else if (idLower.includes("parisienne")) environment = "ville";
          else if (idLower.includes("cantal")) environment = "campagne";
          data.environment = environment;

          data.ageGroup = data.ageGroups ? data.ageGroups.join(", ") : "";
          data.image = data.heroImage || "/default.jpg";
          data.description = data.heroSubtitle || "";
          docs.push({ id: docSnap.id, ...data });
        });

        // Trier les séjours : ceux contenant "surf" dans l'ID seront affichés en premier
        docs.sort((a, b) => {
          const aSurf = a.id.toLowerCase().includes("surf") ? 0 : 1;
          const bSurf = b.id.toLowerCase().includes("surf") ? 0 : 1;
          return aSurf - bSurf;
        });

        setSejours(docs);
        // Tri des mois selon l'ordre défini (en comparant en minuscules)
        setAvailableMonths(
          Array.from(monthsSet).sort(
            (a, b) => monthOrder.indexOf(a.toLowerCase()) - monthOrder.indexOf(b.toLowerCase())
          )
        );
        setLoading(false);
      } catch (error) {
        console.error("Erreur lors de la récupération des séjours :", error);
        setLoading(false);
      }
    }

    fetchSejours();
  }, []);

  const handleAgeGroupChange = (e) => {
    const value = e.target.value;
    setSelectedAgeGroups((prev) =>
      prev.includes(value) ? prev.filter((age) => age !== value) : [...prev, value]
    );
  };

  // Correction du filtre pour la période en comparant en minuscules
  const filteredSejours = sejours.filter((sejour) => {
    const periodMatch =
      selectedPeriod === "all" ||
      (sejour.displayMonths &&
        sejour.displayMonths.map((m) => m.toLowerCase()).includes(selectedPeriod.toLowerCase()));
    const environmentMatch =
      selectedEnvironment === "all" || sejour.environment === selectedEnvironment;
    const ageMatch = selectedAgeGroups.some((age) => sejour.ageGroups?.includes(age));
    return periodMatch && environmentMatch && ageMatch;
  });

  const getEnvironmentIcon = (env) => {
    switch (env) {
      case "mer":
        return <FaWater className="text-blue-500" />;
      case "campagne":
        return <FaTree className="text-green-500" />;
      case "montagne":
        return <GiMountainCave className="text-gray-500" />;
      case "ville":
        return <FaCity className="text-purple-500" />;
      default:
        return null;
    }
  };

  const getDuration = (datesArray) => {
    if (!datesArray || datesArray.length === 0) return "";
    const first = new Date(datesArray[0].startDate);
    const last = new Date(datesArray[0].endDate);
    return `${Math.ceil((last - first) / (1000 * 60 * 60 * 24)) + 1} jours`;
  };

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-4xl font-extrabold text-center text-gray-800 mb-8">
        Nos Séjours Inoubliables
      </h1>

      <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
        <select
          id="period-filter"
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="all">Toutes périodes</option>
          {availableMonths.map((month) => (
            <option key={month} value={month}>
              {month.charAt(0).toUpperCase() + month.slice(1)}
            </option>
          ))}
        </select>

        <select
          id="environment-filter"
          value={selectedEnvironment}
          onChange={(e) => setSelectedEnvironment(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="all">Tous les environnements</option>
          <option value="mer">Mer</option>
          <option value="campagne">Campagne</option>
          <option value="montagne">Montagne</option>
          <option value="ville">Ville</option>
        </select>

        <div className="flex items-center space-x-2">
          {["6-10", "11-13", "14-17"].map((age) => (
            <label key={age} className="inline-flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                value={age}
                checked={selectedAgeGroups.includes(age)}
                onChange={handleAgeGroupChange}
                className="form-checkbox h-4 w-4 text-pink-600"
              />
              <span>{age} ans</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSejours.map((sejour) => (
          <Link key={sejour.id} href={`/sejours/${sejour.id}`} className="group block">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden relative transform transition duration-300 hover:scale-105 hover:shadow-2xl">
              <div className="relative">
                <img src={sejour.image} alt={sejour.name} className="w-full h-56 object-cover" />
                <div className="absolute inset-0 bg-black opacity-40 group-hover:opacity-50 transition"></div>
                <h2 className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white px-4 text-center">
                  {sejour.name}
                </h2>
                <div className="absolute top-4 right-4 bg-[#281C47] text-white font-bold py-1 px-3 rounded-md">
                  {sejour.basePrice} €
                </div>
              </div>

              <div className="p-5">
                <p className="text-gray-600 mb-4 line-clamp-2">{sejour.description}</p>
                <div className="grid grid-cols-2 gap-2 text-gray-800 text-sm font-medium">
                  <div className="flex items-center space-x-2">
                    <FaCalendarAlt className="text-pink-500" /> <span>{sejour.period}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FaUserFriends className="text-blue-500" /> <span>{sejour.ageGroup} ans</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FaClock className="text-green-500" /> <span>{getDuration(sejour.dates)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getEnvironmentIcon(sejour.environment)}
                    <span className="capitalize">{sejour.environment}</span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
