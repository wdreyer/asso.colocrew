"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase";

import RecapReservation from "../components/reserver/RecapReservation";
import ReservationForm from "../components/reserver/ReservationForm";
import PaymentOptions from "../components/reserver/PaymentOptions";

import Spinner from "../components/layout/Spinner";
import Link from "next/link";

// Ce composant contient toute la logique et utilise useSearchParams()
function ReservationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1) Récupérer les paramètres dans l'URL
  const urlSejour = searchParams.get("sejour") || "";
  const urlStartDate = searchParams.get("startDate") || "";
  const urlEndDate = searchParams.get("endDate") || "";
  const urlCity = searchParams.get("city") || "";
  const urlAgeGroup = searchParams.get("ageGroup") || "";

  // État pour stocker le document du séjour
  const [sejour, setSejour] = useState(null);
  const [loading, setLoading] = useState(true);

  // Récupération du séjour depuis Firestore
  useEffect(() => {
    async function fetchSejour() {
      if (!urlSejour) return;
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

  // Formulaire initial
  const initialFormData = {
    minorFirstName: "",
    minorLastName: "",
    minorBirthDate: "",
    minorBirthPlace: "",
    minorAddress: "",
    minorCity: "",
    minorPostalCode: "",

    legalFirstName: "",
    legalLastName: "",
    legalPhone: "",
    legalEmail: "",
    legalRelation: "",
    legalRelationOther: "",
    legalAddressDifferent: false,
    legalAddress: "",
    legalCity: "",
    legalPostalCode: "",

    insuranceOpted: false,
    paymentMethod: "CB", // "CB" ou "chequeVirement"
    paymentOption: "oneTime", // "oneTime" ou "twoTimes"
    acceptedCGV: false,
    acceptedDocs: false,
    acceptedNoWithdrawal: false,
    acceptedRGPD: false, // Ajout de l'acceptation RGPD
  };

  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Gestion des changements du formulaire
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Calcul du prix
  const insuranceFee = 58.86;
  const basePrice = sejour ? Number(sejour.basePrice) : 1000;
  const transportFee = Number(
    sejour?.stations?.find((station) => station.name === urlCity)?.priceExtra || 0
  );
  const computedTotalPrice =
    basePrice + transportFee + (formData.insuranceOpted ? insuranceFee : 0);

  // Validation basique du formulaire
  const validateForm = () => {
    const errors = [];

    // Champs mineur obligatoires
    if (
      !formData.minorFirstName ||
      !formData.minorLastName ||
      !formData.minorBirthDate ||
      !formData.minorAddress ||
      !formData.minorCity ||
      !formData.minorPostalCode
    ) {
      errors.push("Veuillez remplir tous les champs obligatoires du mineur.");
    }

    // Champs responsable légal
    if (
      !formData.legalFirstName ||
      !formData.legalLastName ||
      !formData.legalPhone ||
      !formData.legalEmail ||
      !formData.legalRelation
    ) {
      errors.push("Veuillez remplir tous les champs obligatoires du responsable légal.");
    }

    // Relation "autre"
    if (formData.legalRelation === "autre" && !formData.legalRelationOther) {
      errors.push("Veuillez préciser la relation du responsable légal (autre).");
    }

    // Adresse différente
    if (formData.legalAddressDifferent) {
      if (!formData.legalAddress || !formData.legalCity || !formData.legalPostalCode) {
        errors.push("Veuillez remplir l'adresse complète du responsable légal.");
      }
    }

    // Cases à cocher
    if (!formData.acceptedCGV) {
      errors.push("Vous devez accepter les CGV.");
    }
    if (!formData.acceptedDocs) {
      errors.push("Vous devez accepter d'envoyer les documents demandés.");
    }
    if (!formData.acceptedNoWithdrawal) {
      errors.push("Vous devez reconnaître que le droit de rétractation ne s'applique pas.");
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

  // Gestion de la soumission du formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Calcul de l'acompte si option "twoTimes"
      const depositValue =
        formData.paymentOption === "twoTimes" ? computedTotalPrice * 0.3 : 0;

      // 1) Enregistrement de la réservation
      const resReservation = await fetch("/api/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          computedTotalPrice,
          urlSejour,
          urlStartDate,
          urlEndDate,
          urlCity,
          urlAgeGroup, // on passe la tranche d'âge
          insuranceFee,
          depositValue,
          transportFee,
        }),
      });
      if (!resReservation.ok) {
        throw new Error("Erreur lors de l'enregistrement de la réservation.");
      }
      const { reservationId, tokenUnique } = await resReservation.json();

      // Paiement par chèque/virement
      if (formData.paymentMethod === "chequeVirement") {
        alert(
          "Votre réservation a bien été enregistrée.\n" +
            "Vous disposez de 15 jours pour envoyer votre règlement (chèque ou virement)."
        );
        router.push(`/reservation/${tokenUnique}?justCreated=true`);
        setIsSubmitting(false);
        return;
      }

      // Paiement par carte bancaire via Stripe
      const amountToCharge =
        formData.paymentOption === "oneTime" ? computedTotalPrice : depositValue;

      // 2) Création de la session Stripe
      console.log("Données envoyées à Stripe:", {
        urlStartDate,
        urlEndDate,
      });
      const resStripe = await fetch("/api/create-stripe-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUnique,
          reservationId,
          amount: amountToCharge,
          currency: "eur",
          sejourTitle: sejour.name,
          // Passage de la tranche d'âge et des dates
          ageGroup: urlAgeGroup,
          startDate: urlStartDate,
          endDate: urlEndDate,
          paymentOption: formData.paymentOption,
          metadata: {
            sejour: JSON.stringify({
              title: sejour.name,
              startDate: urlStartDate,
              endDate: urlEndDate,
              city: urlCity,
              basePrice: basePrice,
              transportFee: transportFee,
            }),
            legalGuardian: JSON.stringify({
              firstName: formData.legalFirstName,
              lastName: formData.legalLastName,
              phone: formData.legalPhone,
              email: formData.legalEmail,
              relation: formData.legalRelation,
              relationOther: formData.legalRelationOther,
            }),
          },
          customer_email: formData.legalEmail,
        }),
      });
      if (!resStripe.ok) {
        throw new Error("Erreur lors de la création de la session Stripe.");
      }
      const { url } = await resStripe.json();

      // 3) Redirection vers Stripe
      router.push(url);
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
      alert("Une erreur est survenue, veuillez réessayer.");
    }

    setIsSubmitting(false);
  };

  if (loading || !sejour) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen md:p-6">
      {/* Récapitulatif */}
      <div className="bg-white rounded p-4">
        <RecapReservation
          sejour={sejour}
          urlStartDate={urlStartDate}
          urlEndDate={urlEndDate}
          urlCity={urlCity}
          urlAgeGroup={urlAgeGroup}
          basePrice={basePrice}
          computedTotalPrice={computedTotalPrice}
        />
      </div>

      {/* Formulaire */}
      <div className="bg-white rounded p-4 m">
        <form onSubmit={handleSubmit} className="space-y-6">
          <ReservationForm formData={formData} handleChange={handleChange} />

          <PaymentOptions
            formData={formData}
            handleChange={handleChange}
            basePrice={basePrice}
            transportFee={transportFee}
            computedTotalPrice={computedTotalPrice}
            insuranceFee={insuranceFee}
            urlCity={urlCity}
            urlStartDate={urlStartDate}
            urlEndDate={urlEndDate}
            urlAgeGroup={urlAgeGroup}
          />

          <div className="mt-6 text-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full font-poppins cursor-pointer md:w-auto bg-[#B8336A] text-white px-6 py-2 rounded-md hover:bg-[#A2225A] transition duration-300 text-sm md:text-base"
            >
              {isSubmitting
                ? "Envoi en cours..."
                : formData.paymentMethod === "chequeVirement"
                ? "Valider la réservation"
                : "Aller à la page de paiement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Composant par défaut enveloppé dans une Suspense boundary
export default function ReservationPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ReservationPageContent />
    </Suspense>
  );
}
