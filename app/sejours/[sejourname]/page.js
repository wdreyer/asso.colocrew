"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/app/firebase";
import { resolveSejourPriceRange } from "@/src/lib/pricing";
import { firstBookableSession, isPublicBookableSession, isSessionFull, publicBookableSessions } from "@/src/lib/availability";

import GenericSejour from "@/app/components/sejour/GenericSejour";
import SejourTabs from "@/app/components/sejour/SejourTabs";
import BottomReservationBar from "@/app/components/sejour/BottomReservationBar";
import Spinner from "@/app/components/layout/Spinner";

const SUR_PLACE_LABEL = "Sur place";

function normalizeCityName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isSurPlace(value) {
  return normalizeCityName(value) === "sur place";
}

function findStationByName(stations, cityName) {
  const target = normalizeCityName(cityName);
  if (!target) return null;
  return (Array.isArray(stations) ? stations : []).find(
    (station) => normalizeCityName(station?.name) === target,
  ) || null;
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value) {
  const stopWords = new Set([
    "my",
    "creative",
    "camp",
    "sejour",
    "sejours",
    "colo",
    "colocrew",
    "ete",
    "summer",
    "vacances",
    "de",
    "du",
    "des",
    "le",
    "la",
    "les",
  ]);

  return new Set(
    normalizeForMatch(value)
      .split(" ")
      .filter((token) => token.length > 2 && !stopWords.has(token))
  );
}

function isRetourForCurrentSejour(retourSejourName, sejourDocId, sejourLabel) {
  const retour = normalizeForMatch(retourSejourName);
  if (!retour) return false;

  const candidates = [sejourDocId, sejourLabel]
    .map((item) => normalizeForMatch(item))
    .filter(Boolean);

  if (candidates.some((candidate) => retour === candidate || retour.includes(candidate) || candidate.includes(retour))) {
    return true;
  }

  const uniqueTokens = new Set([
    ...tokenSet(sejourDocId),
    ...tokenSet(sejourLabel),
  ]);

  if (uniqueTokens.size === 0) return false;
  let hits = 0;
  uniqueTokens.forEach((token) => {
    if (retour.includes(token)) hits += 1;
  });

  return hits >= 1;
}

function buildFeedbackData(retours) {
  if (!Array.isArray(retours) || retours.length === 0) {
    return {
      retours: [],
      reviewsCount: 0,
      avgGlobal: null,
      parentCount: 0,
      youngCount: 0,
      topCategories: [],
      featuredTestimonial: null,
      testimonials: [],
    };
  }

  const scores = retours
    .map((item) => Number(item.globalScoreNormalized))
    .filter((value) => !Number.isNaN(value));

  const avgGlobal = scores.length
    ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2))
    : null;

  const parentCount = retours.filter((item) => item.respondentType === "parent").length;
  const youngCount = retours.filter((item) => item.respondentType === "jeune").length;

  const categoryMap = new Map();
  retours.forEach((item) => {
    (item.ratings || []).forEach((rating) => {
      const label = String(rating?.category || "").trim();
      const value = Number(rating?.normalized);
      if (!label || Number.isNaN(value)) return;
      if (!categoryMap.has(label)) {
        categoryMap.set(label, { total: 0, count: 0 });
      }
      const current = categoryMap.get(label);
      current.total += value;
      current.count += 1;
    });
  });

  const topCategories = Array.from(categoryMap.entries())
    .map(([label, data]) => ({
      label,
      average: Number((data.total / data.count).toFixed(2)),
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const testimonials = retours
    .flatMap((item) => {
      const author =
        item.parentName ||
        item.respondentName ||
        item.childName ||
        (item.respondentType === "jeune" ? "Jeune" : "Parent");

      const entries = [];
      (item.highlights || []).forEach((text) => {
        const quote = String(text || "").trim();
        if (quote.length >= 30) {
          entries.push({ quote, author, score: Number(item.globalScoreNormalized) || 0 });
        }
      });

      (item.comments || []).forEach((comment) => {
        const quote = String(comment?.text || "").trim();
        if (quote.length >= 45) {
          entries.push({ quote, author, score: Number(item.globalScoreNormalized) || 0 });
        }
      });

      return entries;
    })
    .filter((item) => item.quote.length <= 260)
    .sort((a, b) => b.score - a.score);

  const uniqueTestimonials = [];
  const seen = new Set();
  testimonials.forEach((item) => {
    const key = normalizeForMatch(item.quote);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueTestimonials.push(item);
  });

  return {
    retours,
    reviewsCount: retours.length,
    avgGlobal,
    parentCount,
    youngCount,
    topCategories,
    featuredTestimonial: uniqueTestimonials[0] || null,
    testimonials: uniqueTestimonials.slice(0, 8),
  };
}

export default function SejourDetail() {
  const { sejourname } = useParams();
  const router = useRouter();

  const [sejour, setSejour] = useState(null);

  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("11-13");

  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [selectedDepartureCity, setSelectedDepartureCity] = useState(SUR_PLACE_LABEL);
  const [selectedReturnCity, setSelectedReturnCity] = useState(SUR_PLACE_LABEL);

  const [basePriceRange, setBasePriceRange] = useState({ min: 0, max: 0 });
  const [transportPrice, setTransportPrice] = useState(0);
  const [feedback, setFeedback] = useState(() => buildFeedbackData([]));

  useEffect(() => {
    if (!sejourname) return undefined;

    const docRef = doc(db, "sejours", sejourname);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          console.error("Aucun document trouvé pour:", sejourname);
          return;
        }

        const rawData = docSnap.data();
        const bookableDates = publicBookableSessions(docSnap.id, rawData.dates || []);
        const data = { id: docSnap.id, ...rawData, dates: bookableDates };
        setSejour(data);

        if (Array.isArray(data.dates) && data.dates.length > 0) {
          let defaultDateOption = firstBookableSession(data.dates);
          if (data?.promotion?.active && data.promotion.startDate) {
            const promoStart = String(data.promotion.startDate).slice(0, 10);
            const promoEntry = data.dates.find(
              (d) => typeof d === "object" && String(d.startDate || "").slice(0, 10) === promoStart
            );
            if (promoEntry && !isSessionFull(promoEntry)) defaultDateOption = promoEntry;
          }

          if (defaultDateOption && typeof defaultDateOption === "object") {
            setSelectedStartDate(defaultDateOption.startDate || "");
            setSelectedEndDate(defaultDateOption.endDate || "");
            setBasePriceRange(resolveSejourPriceRange(data, defaultDateOption.startDate));
          } else if (defaultDateOption) {
            setSelectedStartDate(defaultDateOption);
            setSelectedEndDate("");
            setBasePriceRange(resolveSejourPriceRange(data, defaultDateOption));
          }
        } else {
          setSelectedStartDate("");
          setSelectedEndDate("");
          setBasePriceRange(resolveSejourPriceRange(data));
        }

        if (Array.isArray(data.ageGroups) && data.ageGroups.length > 0) {
          setSelectedAgeGroup(data.ageGroups[0]);
        }

        setSelectedDepartureCity(SUR_PLACE_LABEL);
        setSelectedReturnCity(SUR_PLACE_LABEL);
      },
      (err) => {
        console.error("Erreur firestore:", err);
      },
    );

    return () => unsubscribe();
  }, [sejourname]);

  useEffect(() => {
    async function fetchRetoursForSejour() {
      if (!sejourname || !sejour?.name) return;

      try {
        const snap = await getDocs(collection(db, "retours"));
        const allRetours = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        const scopedRetours = allRetours.filter((item) =>
          isRetourForCurrentSejour(item.sejourName, sejourname, sejour.name)
        );
        setFeedback(buildFeedbackData(scopedRetours));
      } catch (error) {
        console.error("Erreur chargement retours séjour:", error);
        setFeedback(buildFeedbackData([]));
      }
    }

    fetchRetoursForSejour();
  }, [sejour, sejourname]);

  useEffect(() => {
    if (!sejour?.stations) {
      setTransportPrice(0);
      return;
    }

    if (isSurPlace(selectedDepartureCity) && (!isRoundTrip || isSurPlace(selectedReturnCity))) {
      setTransportPrice(0);
      return;
    }

    if (!isRoundTrip) {
      const station = findStationByName(sejour.stations, selectedDepartureCity);
      setTransportPrice(station ? station.priceExtra : 0);
      return;
    }

    if (normalizeCityName(selectedDepartureCity) === normalizeCityName(selectedReturnCity)) {
      if (isSurPlace(selectedDepartureCity)) {
        setTransportPrice(0);
        return;
      }
      const station = findStationByName(sejour.stations, selectedDepartureCity);
      setTransportPrice(station ? station.priceExtra : 0);
      return;
    }

    const dep = findStationByName(sejour.stations, selectedDepartureCity);
    const ret = findStationByName(sejour.stations, selectedReturnCity);
    const depPrice = dep?.priceExtra || 0;
    const retPrice = ret?.priceExtra || 0;
    setTransportPrice(depPrice / 2 + retPrice / 2);
  }, [isRoundTrip, selectedDepartureCity, selectedReturnCity, sejour]);

  const handleDateChange = (event) => {
    if (!sejour) return;

    const chosenStartDate = event.target.value;
    const selectedDateEntry = (sejour.dates || []).find((entry) => {
      if (typeof entry === "object") return entry.startDate === chosenStartDate;
      return entry === chosenStartDate;
    });
    if (isSessionFull(selectedDateEntry)) return;
    setSelectedStartDate(chosenStartDate);

    if (Array.isArray(sejour.dates)) {
      if (selectedDateEntry && typeof selectedDateEntry === "object") {
        setSelectedEndDate(selectedDateEntry.endDate || "");
      } else {
        setSelectedEndDate("");
      }
    }

    setBasePriceRange(resolveSejourPriceRange(sejour, chosenStartDate));
  };

  const handleAgeGroupChange = (event) => setSelectedAgeGroup(event.target.value);

  const handleRoundTripChange = (checked) => {
    setIsRoundTrip(checked);
    if (!checked) {
      setSelectedReturnCity(selectedDepartureCity);
    }
  };

  const handleDepartureCityChange = (city) => {
    setSelectedDepartureCity(city);
    if (!isRoundTrip) {
      setSelectedReturnCity(city);
    }
  };

  const handleReturnCityChange = (city) => {
    setSelectedReturnCity(city);
  };

  const handleReservation = () => {
    if (!sejour) return;
    const selectedSession = (sejour.dates || []).find((entry) =>
      typeof entry === "object" ? entry.startDate === selectedStartDate : entry === selectedStartDate,
    );
    if (!selectedStartDate || !isPublicBookableSession(sejour.id, selectedSession)) return;

    const queryString =
      `/reserver?sejour=${encodeURIComponent(sejour.id || sejour.name)}` +
      `&startDate=${encodeURIComponent(selectedStartDate)}` +
      `&endDate=${encodeURIComponent(selectedEndDate)}` +
      `&departureCity=${encodeURIComponent(selectedDepartureCity)}` +
      `&returnCity=${encodeURIComponent(selectedReturnCity)}` +
      `&ageGroup=${encodeURIComponent(selectedAgeGroup)}`;

    router.push(queryString);
  };

  const hasData = useMemo(() => Boolean(sejour), [sejour]);

  if (!hasData) return <Spinner />;

  return (
    <section className="relative bg-white">
      <GenericSejour sejourData={sejour} reservationPrice={basePriceRange} feedback={feedback} />
      <SejourTabs
        sejour={sejour}
        feedback={feedback}
        sections={sejour.sections || []}
        selectedDate={selectedStartDate}
        selectedAgeGroup={selectedAgeGroup}
        handleDateChange={handleDateChange}
        handleAgeGroupChange={handleAgeGroupChange}
        reservationPrice={basePriceRange}
        handleReservation={handleReservation}
        isRoundTrip={isRoundTrip}
        onRoundTripChange={handleRoundTripChange}
        selectedDepartureCity={selectedDepartureCity}
        selectedReturnCity={selectedReturnCity}
        onDepartureCityChange={handleDepartureCityChange}
        onReturnCityChange={handleReturnCityChange}
      />

      <BottomReservationBar
        sejour={sejour}
        selectedDate={selectedStartDate}
        selectedAgeGroup={selectedAgeGroup}
        reservationPrice={basePriceRange}
        transportPrice={transportPrice}
        handleDateChange={handleDateChange}
        handleAgeGroupChange={handleAgeGroupChange}
        handleReservation={handleReservation}
        isRoundTrip={isRoundTrip}
        onRoundTripChange={handleRoundTripChange}
        selectedDepartureCity={selectedDepartureCity}
        selectedReturnCity={selectedReturnCity}
        onDepartureCityChange={handleDepartureCityChange}
        onReturnCityChange={handleReturnCityChange}
      />
    </section>
  );
}
