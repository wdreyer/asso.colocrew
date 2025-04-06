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


function ReservationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [estimatedPriceString, setEstimatedPriceString] = useState("");

  console.log(estimatedPriceString)

  // 1) RÉCUPÉRER LES PARAMÈTRES DANS L'URL
  const urlSejour = searchParams.get("sejour") || "";
  const urlStartDate = searchParams.get("startDate") || "";
  const urlEndDate = searchParams.get("endDate") || "";
  const urlAgeGroup = searchParams.get("ageGroup") || "";

  // (Transport)
  const urlDepartureCity = searchParams.get("departureCity") || "";
  const urlReturnCity = searchParams.get("returnCity") || "";

  // État pour le séjour Firestore
  const [sejour, setSejour] = useState(null);
  const [loading, setLoading] = useState(true);

  // 2) FORM DATA
  const initialFormData = {
    minor: {
      children: [
        {
          firstName: "Alice",
          lastName: "Dupont",
          birthDate: "2015-01-01",
          birthPlace: "Paris",
          address: "10 Rue de l'École",
          city: "Paris",
          postalCode: "75001",
        },
      ],
    },
    numberOfChildren: "1",
    legal: {
      firstName: "Sophie",
      lastName: "Martin",
      phone: "0601020304",
      email: "sophie.martin@example.com",
      relation: "mère",
      relationOther: "",
      addressDifferent: false,
      address: "",
      city: "",
      postalCode: "",
      promoCode: "",
      cafOrSecu: "",
      justificatif: null, // Fichier PDF si besoin
    },
    insuranceOpted: true,
    paymentMethod: "CB", // ou "chequeVirement", etc.
    acceptedCGV: false,
    acceptedDocs: false,
    acceptedNoWithdrawal: false,
    acceptedRGPD: false,
  };
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 3) CHARGER LE SÉJOUR DEPUIS FIRESTORE
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

  // 4) CALCUL DU PRIX (exemple simplifié)
  const handleChange = (e) => handleNestedChange(e, setFormData);

  const insuranceFee = 58.86;
  const basePrice = sejour ? Number(sejour.basePrice) : 1000;

  // Calcul du prix de transport
  let effectiveTransportFee = 0;
  if (sejour?.stations) {
    if (urlDepartureCity === urlReturnCity) {
      // Même ville => prixExtra complet
      const station = sejour.stations.find((st) => st.name === urlDepartureCity);
      effectiveTransportFee = station ? station.priceExtra : 0;
    } else {
      // 2 villes => moitiés
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
    totalBeforeInsurance *= 0.95; // 5% de réduction
  } else if (nbChildren >= 3) {
    totalBeforeInsurance *= 0.9; // 10% de réduction
  }
  const computedTotalPrice =
    totalBeforeInsurance + (formData.insuranceOpted ? insuranceFee : 0);

  // 5) VALIDATION DU FORMULAIRE (simplifiée)
  const validateForm = () => {
    const errors = [];

    // Champs enfants obligatoires
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
      errors.push(
        "Veuillez remplir tous les champs obligatoires pour chaque enfant."
      );
    }

    // Champs parent obligatoires
    if (
      !formData.legal.firstName ||
      !formData.legal.lastName ||
      !formData.legal.phone ||
      !formData.legal.email ||
      !formData.legal.relation
    ) {
      errors.push(
        "Veuillez remplir tous les champs obligatoires du responsable légal."
      );
    }

    if (formData.legal.relation === "autre" && !formData.legal.relationOther) {
      errors.push("Veuillez préciser la relation (autre).");
    }

    if (formData.legal.addressDifferent) {
      if (
        !formData.legal.address ||
        !formData.legal.city ||
        !formData.legal.postalCode
      ) {
        errors.push(
          "Veuillez remplir l'adresse complète du responsable légal."
        );
      }
    }

    // CGV, etc.
    if (!formData.acceptedCGV) {
      errors.push("Vous devez accepter les CGV.");
    }
    if (!formData.acceptedDocs) {
      errors.push("Vous devez accepter d'envoyer les documents demandés.");
    }
    if (!formData.acceptedNoWithdrawal) {
      errors.push(
        "Vous devez reconnaître que le droit de rétractation ne s'applique pas."
      );
    }
    if (!formData.acceptedRGPD) {
      errors.push(
        "Vous devez accepter la politique de confidentialité (RGPD)."
      );
    }

    if (errors.length > 0) {
      alert(errors.join("\n"));
      return false;
    }
    return true;
  };

  // 6) SUBMIT (uniquement vers /api/reservation)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Préparer le FormData, si vous gérez l'upload d'un fichier
      const formDataToSend = new FormData();

      // Joindre le fichier PDF, s’il existe
      if (formData.legal.justificatif) {
        formDataToSend.append(
          "file",
          formData.legal.justificatif,
          formData.legal.justificatif.name
        );
      }

      // Joindre les autres champs JSON
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
      // On enlève le fichier pour éviter de le doubler
      otherFields.legal.justificatif = undefined;

      formDataToSend.append("fields", JSON.stringify(otherFields));

      // Appel vers notre API
      const res = await fetch("/api/reservation", {
        method: "POST",
        body: formDataToSend, // On envoie le FormData (incluant PDF)
      });

      if (!res.ok) {
        throw new Error("Erreur lors de l'enregistrement de la réservation.");
      }

      // Récupérer la réponse
      const { reservationId, tokenUnique } = await res.json();
      alert("Votre réservation est bien enregistrée !");
      // Redirection si besoin
      router.push(`/reservation/${tokenUnique}?justCreated=true`);
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
      alert("Une erreur est survenue, veuillez réessayer.");
    }

    setIsSubmitting(false);
  };

  // 7) AFFICHAGE
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Spinner />
      </div>
    );
  }

  // Séjour introuvable ou non renseigné
  if (!sejour) {
    return <div className="p-4">Aucun séjour à afficher.</div>;
  }

  return (
    <div className="min-h-screen md:p-6">
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

          {/* Si vous conservez le composant PaymentOptions */}
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
              {isSubmitting ? "Envoi en cours..." : "Valider la réservation"}
            </button>
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
