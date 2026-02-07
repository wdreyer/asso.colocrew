"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase";

import RecapReservation from "../components/reserver/RecapReservation";
import ReservationForm from "../components/reserver/ReservationForm";
import PaymentOptions from "../components/reserver/PaymentOptions";

import Spinner from "../components/layout/Spinner";

// ─────────────────────────────────────────────────────
// GESTIONNAIRE DE CHANGEMENTS (pour la dot notation)
// ─────────────────────────────────────────────────────
function handleNestedChange(e, setFormData) {
  const { name, value, type, checked } = e.target;
  if (name.includes(".")) {
    const keys = name.split(".");
    setFormData((prev) => {
      let newObj = { ...prev };
      let temp = newObj;
      for (let i = 0; i < keys.length - 1; i++) {
        temp[keys[i]] = { ...temp[keys[i]] };
        temp = temp[keys[i]];
      }
      temp[keys[keys.length - 1]] = type === "checkbox" ? checked : value;
      return newObj;
    });
  } else {
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }
}

// Modal de traitement
function ProcessingModal() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <Spinner />
        <h2 className="text-xl font-bold mt-4" style={{ color: "#B8336A" }}>
          Votre réservation est en cours de traitement...
        </h2>
        <p className="text-gray-600 mt-2">
          Veuillez patienter quelques instants.
        </p>
      </div>
    </div>
  );
}

function ReservationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [estimatedPriceString, setEstimatedPriceString] = useState("");

  // 1) Récupérer les paramètres dans l'URL
  const urlSejour = searchParams.get("sejour") || "";
  const urlStartDate = searchParams.get("startDate") || "";
  const urlEndDate = searchParams.get("endDate") || "";
  const urlAgeGroup = searchParams.get("ageGroup") || "";
  const urlDepartureCity = searchParams.get("departureCity") || "";
  const urlReturnCity = searchParams.get("returnCity") || "";

  // État pour le séjour Firestore
  const [sejour, setSejour] = useState(null);
  const [loading, setLoading] = useState(true);

  // 2) FORM DATA avec valeurs vides
  const initialFormData = {
    minor: {
      children: [
        {
          firstName: "",
          lastName: "",
          birthDate: "",
          birthPlace: "",
          address: "",
          city: "",
          postalCode: "",
        },
      ],
    },
    numberOfChildren: "",
    legal: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      relation: "",
      addressDifferent: false,
      address: "",
      city: "",
      postalCode: "",
      promoCode: "",
      cafOrSecu: "",
      qf: "",
      justificatif: null, // Aucun fichier
      message: "",
    },
    insuranceOpted: false,
    paymentMethod: "CB",
    acceptedCGV: false,
    acceptedRGPD: false,
  };

  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 3) Charger le séjour depuis Firestore
  useEffect(() => {
    async function fetchSejour() {
      if (!urlSejour) {
        setLoading(false);
        return;
      }
      // Slugifier le paramètre
      const slug = urlSejour
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-");

      const docRef = doc(db, "sejours", slug);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSejour(docSnap.data());
      } else {
        alert("Séjour non trouvé.");
      }
      setLoading(false);
    }
    fetchSejour();
  }, [urlSejour]);

  // 4) Calcul du prix (exemple simplifié)
  const handleChange = (e) => handleNestedChange(e, setFormData);
  const insuranceFee = 58.86;
  const basePrice = sejour ? Number(sejour.basePrice) : 1000;

  // Calcul du prix de transport
  let effectiveTransportFee = 0;
  if (sejour?.stations) {
    if (urlDepartureCity === urlReturnCity) {
      const station = sejour.stations.find((st) => st.name === urlDepartureCity);
      effectiveTransportFee = station ? station.priceExtra : 0;
    } else {
      const dep = sejour.stations.find((st) => st.name === urlDepartureCity);
      const ret = sejour.stations.find((st) => st.name === urlReturnCity);
      const depPrice = dep ? dep.priceExtra : 0;
      const retPrice = ret ? ret.priceExtra : 0;
      effectiveTransportFee = depPrice / 2 + retPrice / 2;
    }
  }

  const nbChildren = parseInt(formData.numberOfChildren, 10);
  let totalBeforeInsurance = basePrice + effectiveTransportFee;
  if (nbChildren === 2) {
    totalBeforeInsurance *= 0.95;
  } else if (nbChildren >= 3) {
    totalBeforeInsurance *= 0.9;
  }
  const computedTotalPrice =
    totalBeforeInsurance + (formData.insuranceOpted ? insuranceFee : 0);

  // 5) Validation du formulaire (simplifiée)
  const validateForm = () => {
    const errors = [];
    if (
      formData.minor.children.some(
        (child) =>
          !child.firstName ||
          !child.lastName ||
          !child.birthDate ||
          !child.address ||
          !child.city ||
          !child.postalCode
      )
    ) {
      errors.push("Veuillez remplir tous les champs obligatoires pour chaque enfant.");
    }
    if (
      !formData.legal.firstName ||
      !formData.legal.lastName ||
      !formData.legal.phone ||
      !formData.legal.email ||
      !formData.legal.relation
    ) {
      errors.push("Veuillez remplir tous les champs obligatoires du responsable légal.");
    }
    if (formData.legal.relation === "autre" && !formData.legal.relationOther) {
      errors.push("Veuillez préciser la relation (autre).");
    }
    if (formData.legal.addressDifferent) {
      if (!formData.legal.address || !formData.legal.city || !formData.legal.postalCode) {
        errors.push("Veuillez remplir l'adresse complète du responsable légal.");
      }
    }
    if (!formData.acceptedCGV) {
      errors.push("Vous devez accepter les CGV.");
    }
    if (!formData.acceptedRGPD) {
      errors.push("Vous devez accepter la politique de confidentialité (RGPD).");
    }
    if (errors.length > 0) {
      alert(errors.join("\n"));
      return false;
    }
    return true;
  };

  // 6) Submit (uniquement vers /api/reservation)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const formDataToSend = new FormData();
      if (formData.legal.justificatif) {
        formDataToSend.append(
          "file",
          formData.legal.justificatif,
          formData.legal.justificatif.name
        );
      }
      const otherFields = {
        ...formData,
        estimatedPriceString,
        computedTotalPrice,
        urlSejour,
        urlStartDate,
        urlEndDate,
        urlAgeGroup,
        departureCity: urlDepartureCity,
        returnCity: urlReturnCity,
        insuranceFee,
        transportFee: effectiveTransportFee,
      };
      otherFields.legal.justificatif = undefined;
      formDataToSend.append("fields", JSON.stringify(otherFields));

      const res = await fetch("/api/reservation", {
        method: "POST",
        body: formDataToSend,
      });

      if (!res.ok) {
        throw new Error("Erreur lors de l'enregistrement de la réservation.");
      }

      const { reservationId, tokenUnique } = await res.json();
      router.push(`/reservation/${tokenUnique}?justCreated=true`);
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
      alert("Une erreur est survenue, veuillez réessayer.");
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Spinner />
      </div>
    );
  }

  if (!sejour) {
    return <div className="p-4">Aucun séjour à afficher.</div>;
  }

  return (
    <div className="min-h-screen md:p-6 relative">
      {/* Affichage de la modal pendant la soumission */}
      {isSubmitting && <ProcessingModal />}

      {/* Récapitulatif */}
      <div className="bg-white rounded p-4">
        <RecapReservation
          sejour={sejour}
          urlStartDate={urlStartDate}
          urlEndDate={urlEndDate}
          urlAgeGroup={urlAgeGroup}
          basePrice={basePrice}
          computedTotalPrice={computedTotalPrice}
          departureCity={urlDepartureCity}
          returnCity={urlReturnCity}
        />
      </div>

      {/* Formulaire + paiement */}
      <div className="bg-white rounded p-4 my-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <ReservationForm formData={formData} handleChange={handleChange} />
          <PaymentOptions
            formData={formData}
            handleChange={handleChange}
            basePrice={basePrice}
            transportFee={effectiveTransportFee}
            sejour={sejour}
            insuranceFee={insuranceFee}
            urlAgeGroup={urlAgeGroup}
            numberOfChildren={parseInt(formData.numberOfChildren, 10)}
            onEstimatedPriceChange={setEstimatedPriceString}
          />
          <div className="mt-6 text-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full font-poppins cursor-pointer md:w-auto bg-[#B8336A] text-white px-6 py-2 rounded-md hover:bg-[#A2225A] transition duration-300 text-sm md:text-base"
            >
              {isSubmitting ? "Envoi en cours..." : "Estimer votre tarif"}
            </button>
            <p className="mt-2 text-sm text-gray-600">
              Ça prend 2 min, on revient très vite vers toi.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReservationPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ReservationPageContent />
    </Suspense>
  );
}
