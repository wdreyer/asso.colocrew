"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase";

import GenericSejour from "@/app/components/sejour/GenericSejour";
import SejourTabs from "@/app/components/sejour/SejourTabs";
import BottomReservationBar from "@/app/components/sejour/BottomReservationBar";
import Spinner from "@/app/components/layout/Spinner";

export default function SejourDetail() {
  const { sejourname } = useParams();
  const router = useRouter();

  // Le séjour complet (FireStore)
  const [sejour, setSejour] = useState(null);

  // Dates
  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");

  // Tranche d'âge
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("11-13");

  // Aller-retour différent ou non
  const [isRoundTrip, setIsRoundTrip] = useState(false);

  // Villes
  const [selectedDepartureCity, setSelectedDepartureCity] = useState("Sur Place");
  const [selectedReturnCity, setSelectedReturnCity] = useState("Sur Place");

  // Prix base & transport
  const [basePrice, setBasePrice] = useState(0);
  const [transportPrice, setTransportPrice] = useState(0);

  // Récupération du séjour Firestore
  useEffect(() => {
    async function fetchSejour() {
      if (!sejourname) return;
      try {
        const docRef = doc(db, "sejours", sejourname);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setSejour(data);

          // Dates
          if (data.dates?.length) {
            const firstDateOption = data.dates[0];
            if (typeof firstDateOption === "object") {
              setSelectedStartDate(firstDateOption.startDate);
              setSelectedEndDate(firstDateOption.endDate);
            } else {
              setSelectedStartDate(firstDateOption);
              setSelectedEndDate("");
            }
          }

          // Prix de base
          setBasePrice(data.basePrice || 0);

         

          // Villes
          if (data.stations?.length) {
            setSelectedDepartureCity("Sur Place");
            setSelectedReturnCity("Sur Place");
          }
        } else {
          console.error("Aucun document trouvé pour:", sejourname);
        }
      } catch (err) {
        console.error("Erreur firestore:", err);
      }
    }
    fetchSejour();
  }, [sejourname]);

  // Calcul du transport : s’exécute quand isRoundTrip / selectedDepartureCity / selectedReturnCity changent
  useEffect(() => {
    if (!sejour || !sejour.stations) {
      setTransportPrice(0);
      return;
    }

    if (!isRoundTrip) {
      // Aller simple => retour = départ
      const station = sejour.stations.find(
        (s) => s.name === selectedDepartureCity
      );
      setTransportPrice(station ? station.priceExtra : 0);
    } else {
      // Aller-retour
      if (selectedDepartureCity === selectedReturnCity) {
        // Même ville
        const station = sejour.stations.find(
          (s) => s.name === selectedDepartureCity
        );
        setTransportPrice(station ? station.priceExtra : 0);
      } else {
        // Deux villes différentes => moitiés
        const dep = sejour.stations.find(
          (s) => s.name === selectedDepartureCity
        );
        const ret = sejour.stations.find(
          (s) => s.name === selectedReturnCity
        );
        const depPrice = dep?.priceExtra || 0;
        const retPrice = ret?.priceExtra || 0;
        setTransportPrice(depPrice / 2 + retPrice / 2);
      }
    }
  }, [isRoundTrip, selectedDepartureCity, selectedReturnCity, sejour]);

  // Handlers

  // => Date
  const handleDateChange = (e) => {
    const chosen = e.target.value;
    setSelectedStartDate(chosen);
    if (sejour?.dates) {
      const match = sejour.dates.find((d) => {
        if (typeof d === "object") return d.startDate === chosen;
        return d === chosen;
      });
      if (match && typeof match === "object") {
        setSelectedEndDate(match.endDate);
      } else {
        setSelectedEndDate("");
      }
    }
  };

  // => Age
  const handleAgeGroupChange = (e) => setSelectedAgeGroup(e.target.value);

  // => A/R différent ?
  const handleRoundTripChange = (checked) => {
    setIsRoundTrip(checked);
    // Si on vient de décocher => on force la ville de retour = ville de départ
    if (!checked) {
      setSelectedReturnCity(selectedDepartureCity);
    }
  };

  // => Ville départ
  const handleDepartureCityChange = (city) => {
    setSelectedDepartureCity(city);
    // Si on n’est pas en aller/retour différent => on force la même au retour
    if (!isRoundTrip) {
      setSelectedReturnCity(city);
    }
  };

  // => Ville retour
  const handleReturnCityChange = (city) => {
    setSelectedReturnCity(city);
  };

  // => Réserver
  const handleReservation = () => {
    if (!sejour) return;
    // On assemble l'URL
    const queryString =
      `/reserver?sejour=${encodeURIComponent(sejour.name)}` +
      `&startDate=${encodeURIComponent(selectedStartDate)}` +
      `&endDate=${encodeURIComponent(selectedEndDate)}` +
      `&departureCity=${encodeURIComponent(selectedDepartureCity)}` +
      `&returnCity=${encodeURIComponent(selectedReturnCity)}` +
      `&ageGroup=${encodeURIComponent(selectedAgeGroup)}`;
    router.push(queryString);
  };

  if (!sejour) return <Spinner />;

  return (
    <section className="relative">
      <GenericSejour
        sejourData={sejour}
        reservationPrice={basePrice}
        sejourSlug={sejourname}
      />

      {/* Onglets + ReservationCard */}
      <SejourTabs
        sejour={sejour}
        sections={sejour.sections || []}
        // Date & Age
        selectedDate={selectedStartDate}
        selectedAgeGroup={selectedAgeGroup}
        handleDateChange={handleDateChange}
        handleAgeGroupChange={handleAgeGroupChange}
        reservationPrice={basePrice}
        handleReservation={handleReservation}

        // Transport
        isRoundTrip={isRoundTrip}
        onRoundTripChange={handleRoundTripChange}
        selectedDepartureCity={selectedDepartureCity}
        selectedReturnCity={selectedReturnCity}
        onDepartureCityChange={handleDepartureCityChange}
        onReturnCityChange={handleReturnCityChange}
      />

      {/* Barre de réservation en bas */}
      <BottomReservationBar
        sejour={sejour}
        selectedDate={selectedStartDate}
        selectedAgeGroup={selectedAgeGroup}
        reservationPrice={basePrice}
        transportPrice={transportPrice}
        handleDateChange={handleDateChange}
        handleAgeGroupChange={handleAgeGroupChange}
        handleReservation={handleReservation}

        // Transport
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
