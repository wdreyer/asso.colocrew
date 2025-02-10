"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase";

// Import des composants
import GenericSejour from "@/app/components/sejour/GenericSejour";
import SejourTabs from "@/app/components/sejour/SejourTabs";
import BottomReservationBar from "@/app/components/sejour/BottomReservationBar";
import Spinner from "@/app/components/layout/Spinner";

/**
 * SejourDetail : on gère startDate ET endDate
 */
export default function SejourDetail() {
  const { sejourname } = useParams();
  const router = useRouter();

  // On garde 2 states distincts pour les dates
  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");

  const [selectedCity, setSelectedCity] = useState("Sur place");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("11-13");
  const [reservationPrice, setReservationPrice] = useState(0);
  const [sejour, setSejour] = useState(null);
  const [basePrice, setBasePrice] = useState(0);

  useEffect(() => {
    console.log("sejourname:", sejourname);
    async function fetchSejour() {
      if (!sejourname) {
        console.error("Aucun sejourname fourni dans l'URL");
        return;
      }
      try {
        const docRef = doc(db, "sejours", sejourname);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log("Données du séjour récupérées:", data);
          setSejour(data);

          // 1) On initialise la date sélectionnée
          if (data.dates && data.dates.length > 0) {
            const firstDateOption = data.dates[0];
            if (typeof firstDateOption === "object") {
              // On a {startDate, endDate}
              setSelectedStartDate(firstDateOption.startDate);
              setSelectedEndDate(firstDateOption.endDate);
            } else {
              // On n'a qu'une string => on la met en startDate
              setSelectedStartDate(firstDateOption);
              setSelectedEndDate(""); // ou la même si c'est un aller-retour sur la même date
            }
          }

          // 2) Prix de base
          setBasePrice(data.basePrice || 0);

          // 3) Station par défaut
          if (data.stations && data.stations.length > 0) {
            setReservationPrice(data.basePrice + (data.stations[0].priceExtra || 0));
          } else {
            setReservationPrice(data.basePrice || 0);
          }
        } else {
          console.error("Aucun document trouvé pour sejourname:", sejourname);
        }
      } catch (error) {
        console.error("Erreur lors de la récupération du séjour :", error);
      }
    }
    fetchSejour();
  }, [sejourname]);

  // Quand on change la city, on recalcule le prix
  useEffect(() => {
    if (!sejour) return;
    let supplementTransport = 0;
    if (sejour.stations && selectedCity) {
      const stationObj = sejour.stations.find((s) => s.name === selectedCity);
      supplementTransport = stationObj ? stationObj.priceExtra : 0;
    }
    setReservationPrice(basePrice + supplementTransport);
  }, [selectedCity, basePrice, sejour]);

  // Handlers
  const handleDateChange = (e) => {
    // La value sélectionnée est censée correspondre au startDate
    const chosenStart = e.target.value;
    setSelectedStartDate(chosenStart);

    // Cherche l'objet correspondant dans data.dates pour trouver endDate
    if (sejour && sejour.dates) {
      const matchingOption = sejour.dates.find((d) => {
        // si c'est un object { startDate, endDate }
        if (typeof d === "object") {
          return d.startDate === chosenStart;
        }
        // sinon c'est une simple string
        return d === chosenStart;
      });

      if (matchingOption && typeof matchingOption === "object") {
        // on set la endDate
        setSelectedEndDate(matchingOption.endDate);
      } else {
        // si c'est pas un object, ou pas trouvé
        setSelectedEndDate("");
      }
    }
  };

  const handleCityChange = (e) => setSelectedCity(e.target.value);
  const handleAgeGroupChange = (e) => setSelectedAgeGroup(e.target.value);

  /**
   * handleReservation :
   * On passe startDate et endDate dans l'URL
   */
  const handleReservation = () => {
    // Ajout de endDate dans le query param
    const queryString = `/reserver?sejour=${encodeURIComponent(sejour.name)}`
      + `&startDate=${encodeURIComponent(selectedStartDate)}`
      + `&endDate=${encodeURIComponent(selectedEndDate)}`  // <-- endDate
      + `&city=${encodeURIComponent(selectedCity)}`
      + `&ageGroup=${encodeURIComponent(selectedAgeGroup)}`;

    router.push(queryString);
  };

  // Affichage de chargement
  if (!sejour) return <Spinner />;

  return (
    <section id="sejour-detail" className="relative">
      <GenericSejour sejourData={sejour} reservationPrice={reservationPrice} />

      <SejourTabs
        summaryTitle={sejour.summaryTitle || "Le séjour en bref"}
        summaryText={sejour.summaryText || ""}
        sections={sejour.sections || []}
        summaryImage={sejour.summaryImage || sejour.heroImage}
        sejour={sejour}
        // Pour le composant <SejourTabs>, on va lui passer
        // selectedStartDate, selectedEndDate
        selectedDate={selectedStartDate} // si <SejourTabs> n’est pas encore prêt pour 2 states
        selectedCity={selectedCity}
        selectedAgeGroup={selectedAgeGroup}
        reservationPrice={reservationPrice}
        // on modifie handleDateChange pour le nouveau comportement
        handleDateChange={handleDateChange}
        handleCityChange={handleCityChange}
        handleAgeGroupChange={handleAgeGroupChange}
        handleReservation={handleReservation}
      />

      <BottomReservationBar
        sejour={sejour}
        selectedDate={selectedStartDate} // ou 2 props si besoin
        selectedCity={selectedCity}
        selectedAgeGroup={selectedAgeGroup}
        reservationPrice={reservationPrice}
        handleDateChange={handleDateChange}
        handleCityChange={handleCityChange}
        handleAgeGroupChange={handleAgeGroupChange}
        handleReservation={handleReservation}
      />

      <footer className="text-gray-600 dark:text-gray-300 text-center py-2">
        <p className="text-sm">
          Photos non contractuelles. Les conditions d'accueil, d'hébergement et autres sont susceptibles d'évoluer.
        </p>
      </footer>
    </section>
  );
}
