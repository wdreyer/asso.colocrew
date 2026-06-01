"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { FaArrowRight, FaCalendarAlt, FaClock, FaFilePdf, FaUserFriends } from "react-icons/fa";
import { db } from "@/app/firebase";
import { formatPriceRange, resolveLowestSejourPriceRange, resolveSejourPriceRange } from "@/src/lib/pricing";
import Spinner from "../components/layout/Spinner";

const CATALOG_PDF_PATH = "/Catalogue%20Colocrew%20-%20ETE2026.pdf";

const MONTH_ORDER = [
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

const ENVIRONMENT_LABELS = {
  mer: { label: "Mer", emoji: "🌊" },
  montagne: { label: "Montagne", emoji: "⛰️" },
  campagne: { label: "Campagne", emoji: "🌿" },
  ville: { label: "Ville", emoji: "🏙️" },
};

function getEnvironment(rawEnvironment, id, name) {
  const text = String(rawEnvironment || "").trim().toLowerCase();
  if (text.includes("mont")) return "montagne";
  if (text.includes("mer") || text.includes("océan") || text.includes("ocean")) return "mer";
  if (text.includes("camp")) return "campagne";
  if (text.includes("ville") || text.includes("urbain")) return "ville";

  const source = `${id || ""} ${name || ""}`.toLowerCase();
  if (source.includes("surf")) return "mer";
  if (source.includes("ski") || source.includes("eaux-vives") || source.includes("eaux vives")) return "montagne";
  if (source.includes("paris")) return "ville";
  if (source.includes("cantal")) return "campagne";
  return "campagne";
}

function isSejourOnline(item) {
  const status = String(item?.status || "").toLowerCase();
  if (item?.archived === true || status === "archived") return false;
  if (item?.isOnline === false) return false;
  if (status === "offline" || status === "draft" || status === "hidden") return false;
  return true;
}

function getDuration(datesArray) {
  if (!datesArray || datesArray.length === 0) return "";
  const first = new Date(datesArray[0].startDate);
  const last = new Date(datesArray[0].endDate);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return "";
  return `${Math.ceil((last - first) / (1000 * 60 * 60 * 24)) + 1} jours`;
}

function normalizeSejour(docSnap) {
  const data = docSnap.data();
  const monthSet = new Set();

  if (Array.isArray(data.dates)) {
    data.dates.forEach((dateObj) => {
      if (!dateObj?.startDate) return;
      const start = new Date(dateObj.startDate);
      if (Number.isNaN(start.getTime())) return;
      const monthName = start.toLocaleDateString("fr-FR", { month: "long" });
      monthSet.add(monthName.charAt(0).toUpperCase() + monthName.slice(1));
    });
  }

  const displayMonths = Array.from(monthSet);
  const period = displayMonths.join(", ");
  const environment = getEnvironment(data.environment, docSnap.id, data.name);

  return {
    id: docSnap.id,
    ...data,
    displayMonths,
    period,
    environment,
    ageGroup: Array.isArray(data.ageGroups) ? data.ageGroups.join(" / ") : "",
    image: data.heroImage || "/load.png",
    description: data.heroSubtitle || "",
    priceRange: data?.promotion?.active ? resolveLowestSejourPriceRange(data) : resolveSejourPriceRange(data),
    isOnline: isSejourOnline(data),
  };
}

function getPriceBadgeLabel(sejour) {
  const range = sejour?.priceRange || { min: 0, max: 0 };
  if (!(range.min > 0 || range.max > 0)) return "Tarif sur demande";
  if (sejour?.promotion?.active) return `✦ Offre juillet`;
  if (range.min === range.max) return `Dès ${formatPriceRange(range)}`;
  return formatPriceRange(range);
}

export default function SejoursList() {
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedEnvironment, setSelectedEnvironment] = useState("all");
  const [selectedAgeGroups, setSelectedAgeGroups] = useState(["11-13", "14-17"]);
  const [sejours, setSejours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableMonths, setAvailableMonths] = useState([]);

  useEffect(() => {
    async function fetchSejours() {
      try {
        const querySnapshot = await getDocs(collection(db, "sejours"));
        const docs = querySnapshot.docs.map(normalizeSejour);
        const onlineDocs = docs.filter((item) => item.isOnline);
        const monthsSet = new Set();
        onlineDocs.forEach((item) => {
          (item.displayMonths || []).forEach((month) => monthsSet.add(month));
        });

        onlineDocs.sort((a, b) => {
          const aSurf = a.id.toLowerCase().includes("surf") ? 0 : 1;
          const bSurf = b.id.toLowerCase().includes("surf") ? 0 : 1;
          if (aSurf !== bSurf) return aSurf - bSurf;
          return String(a.name || "").localeCompare(String(b.name || ""), "fr", {
            sensitivity: "base",
          });
        });

        setSejours(onlineDocs);
        setAvailableMonths(
          Array.from(monthsSet).sort(
            (a, b) =>
              MONTH_ORDER.indexOf(a.toLowerCase()) - MONTH_ORDER.indexOf(b.toLowerCase()),
          ),
        );
      } catch (error) {
        console.error("Erreur lors de la récupération des séjours :", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSejours();
  }, []);

  const filteredSejours = useMemo(
    () =>
      sejours.filter((sejour) => {
        const periodMatch =
          selectedPeriod === "all" ||
          (sejour.displayMonths || [])
            .map((month) => month.toLowerCase())
            .includes(selectedPeriod.toLowerCase());
        const environmentMatch =
          selectedEnvironment === "all" || sejour.environment === selectedEnvironment;
        const ageMatch =
          !selectedAgeGroups.length ||
          selectedAgeGroups.some((age) => (sejour.ageGroups || []).includes(age));
        return periodMatch && environmentMatch && ageMatch;
      }),
    [sejours, selectedEnvironment, selectedPeriod, selectedAgeGroups],
  );

  const handleAgeGroupChange = (value) => {
    setSelectedAgeGroups((prev) =>
      prev.includes(value) ? prev.filter((age) => age !== value) : [...prev, value],
    );
  };

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f9f5fb_0%,#fff7fb_50%,#ffffff_100%)] pb-16">
      <section className="mx-auto w-full max-w-[1240px] px-5 pt-10 md:px-8 md:pt-14">
        <div className="relative overflow-hidden rounded-[28px] border border-[#ecdff4] bg-white px-6 py-8 shadow-[0_18px_60px_rgba(60,25,90,0.08)] md:px-10 md:py-10">
          <div className="pointer-events-none absolute -left-10 top-0 h-44 w-44 rounded-full bg-[#f2dbe8]/60 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-[#e9e2fb]/65 blur-3xl" />
          <div className="relative">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#a45a86]">
              Saison été 2026
            </p>
            <h1
              className="text-4xl font-extrabold text-[#24173d] md:text-5xl"
              style={{ fontFamily: '"Baloo 2", cursive' }}
            >
              Nos séjours
            </h1>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-6 w-full max-w-[1240px] px-5 md:px-8">
        <div className="rounded-2xl border border-[#ecdff4] bg-white p-4 shadow-[0_8px_30px_rgba(75,37,102,0.06)] md:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <select
              id="period-filter"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="min-h-11 rounded-xl border border-[#e6d8ef] px-4 text-sm font-medium text-[#35224f] outline-none transition focus:border-[#b985cf] focus:ring-2 focus:ring-[#f2d7e9]"
            >
              <option value="all">Toutes périodes</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>

            <select
              id="environment-filter"
              value={selectedEnvironment}
              onChange={(e) => setSelectedEnvironment(e.target.value)}
              className="min-h-11 rounded-xl border border-[#e6d8ef] px-4 text-sm font-medium text-[#35224f] outline-none transition focus:border-[#b985cf] focus:ring-2 focus:ring-[#f2d7e9]"
            >
              <option value="all">Tous les environnements</option>
              <option value="mer">Mer</option>
              <option value="montagne">Montagne</option>
              <option value="campagne">Campagne</option>
              <option value="ville">Ville</option>
            </select>

            <div className="flex flex-wrap items-center gap-2">
              {["11-13", "14-17"].map((age) => {
                const active = selectedAgeGroups.includes(age);
                return (
                  <button
                    key={age}
                    type="button"
                    onClick={() => handleAgeGroupChange(age)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-[#c66793] bg-[#f8e5ef] text-[#9f3d6e]"
                        : "border-[#e6d8ef] bg-white text-[#5b4b6f] hover:border-[#d1bddf]"
                    }`}
                  >
                    {age} ans
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-7 w-full max-w-[1240px] px-5 md:px-8">
        {filteredSejours.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dac5e8] bg-white px-6 py-14 text-center text-[#6a587f]">
            Aucun séjour ne correspond à ces filtres.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {filteredSejours.map((sejour) => {
              const envMeta = ENVIRONMENT_LABELS[sejour.environment] || {
                label: "Nature",
                emoji: "🌿",
              };
              return (
                <Link key={sejour.id} href={`/sejours/${sejour.id}`} className="group block">
                  <article className="overflow-hidden rounded-[24px] border border-[#eadcf3] bg-white shadow-[0_16px_40px_rgba(64,31,97,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_55px_rgba(64,31,97,0.14)]">
                    <div className="relative h-64 overflow-hidden">
                      <img
                        src={sejour.image}
                        alt={sejour.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.58)_100%)]" />
                      <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#8e3f6e]">
                        Ouvert à la réservation
                      </div>
                      <div className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${sejour?.promotion?.active ? "bg-[#A45A86]/90 text-white backdrop-blur-sm" : "bg-[#25173e] text-white"}`}>
                        {getPriceBadgeLabel(sejour)}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <h2
                          className="text-3xl font-extrabold text-white"
                          style={{ fontFamily: '"Baloo 2", cursive' }}
                        >
                          {sejour.name}
                        </h2>
                        {sejour.description ? (
                          <p className="mt-1 max-w-[90%] text-sm text-white/90">
                            {sejour.description}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 p-5 text-sm text-[#3f2f58]">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <FaCalendarAlt className="text-[#be5e8f]" />
                          {sejour.period || "Dates à venir"}
                        </span>
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <FaUserFriends className="text-[#5f7ac5]" />
                          {sejour.ageGroup || "11-17 ans"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <FaClock className="text-[#57a985]" />
                          {getDuration(sejour.dates) || "Durée à confirmer"}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full bg-[#f5edf9] px-3 py-1 font-semibold text-[#6a4d84]">
                          <span>{envMeta.emoji}</span>
                          <span>{envMeta.label}</span>
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mx-auto mt-8 w-full max-w-[1240px] px-5 md:px-8">
        <a
          href={CATALOG_PDF_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex w-full items-center justify-between rounded-2xl border border-[#f0d3e4] bg-[#fff7fc] px-5 py-4 text-[#6b2950] transition hover:border-[#c96b98] hover:bg-[#fff2f9]"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#b8336a] shadow-[0_4px_16px_rgba(184,51,106,0.15)]">
              <FaFilePdf />
            </span>
            <span>
              <span className="block text-sm font-semibold uppercase tracking-[0.08em]">Catalogue été 2026</span>
              <span className="block text-xs text-[#8a5f79]">Voir le programme complet en PDF</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[#b8336a]">
            Ouvrir
            <FaArrowRight className="transition group-hover:translate-x-0.5" />
          </span>
        </a>
      </section>
    </div>
  );
}
