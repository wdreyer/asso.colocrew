"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/app/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import DocumentsObligatoires from "@/app/components/DocumentsObligatoires";
import Spinner from "@/app/components/layout/Spinner";

// Import d'icônes
import {
  FaCalendarAlt,
  FaUserFriends,
  FaHome,
  FaMoneyBillWave
} from "react-icons/fa";

export default function ReservationPage({ params }) {
  const { token } = params; // Paramètre de l'URL
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("justCreated") === "true";
  const router = useRouter();

  const [reservation, setReservation] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!token) return;
    async function fetchReservation() {
      setChargement(true);
      try {
        const requete = query(
          collection(db, "reservations"),
          where("tokenUnique", "==", token)
        );
        const snap = await getDocs(requete);
        if (!snap.empty) {
          setReservation(snap.docs[0].data());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setChargement(false);
      }
    }
    fetchReservation();
  }, [token]);

  // Redirection si aucune réservation trouvée
  useEffect(() => {
    if (!chargement && !reservation) {
      const timer = setTimeout(() => {
        router.push("/reservation");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [chargement, reservation, router]);

  if (chargement) {
    return <Spinner />;
  }

  if (!reservation) {
    return (
      <div className="flex flex-col items-center justify-center h-32">
        <h2 className="text-red-600 p-6">Aucune réservation trouvée ....</h2>
        <h2 className="text-xl font-bold">Redirection en cours...</h2>
      </div>
    );
  }

  // Déstructuration
  const {
    numeroDeReservation,
    createdAt,
    payment,
    options,
    minor,
    legal,
    documents,
    sejour,
  } = reservation || {};

  // Fonction pour formater une date ISO en français
  const formatDateFR = (isoString) => {
    if (!isoString) return "Non renseignée";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Formatage date de création en FR
  const createdAtFr = formatDateFR(createdAt);

  // Séjour
  const sejourTitle = sejour?.urlSejour || "N/A";
  const ageGroup = sejour?.ageGroup || "N/A";
  const city = sejour?.urlCity || "N/A";
  const startDate = formatDateFR(sejour?.startDate);
  const endDate = formatDateFR(sejour?.endDate);

  // Fonctions utilitaires
  const traduireStatut = (statut) => {
    switch (statut) {
      case "not_paid":
        return "Non payé";
      case "in_progress":
        return "En cours";
      case "paid":
        return "Payé";
      default:
        return "N/A";
    }
  };

  const formatMontant = (val) => {
    if (val === undefined || val === null) return "N/A";
    return val + " €";
  };

  // Gestion du mode de paiement
  let paymentMethodLabel = options?.paymentMethod;
  if (paymentMethodLabel === "CB") {
    paymentMethodLabel = "Carte bancaire";
  } else if (paymentMethodLabel === "chequeVirement") {
    paymentMethodLabel = "Chèque ou virement";
  } else {
    paymentMethodLabel = "N/A";
  }

  const frequencyLabel =
    payment?.paymentFrequency === "twoTimes"
      ? "Paiement en deux fois"
      : "Paiement en une fois";

  const colorPrimary = "#B8336A";
  const colorSecondary = "#A2225A";

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Bannière si réservation fraîchement créée */}
      {justCreated && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          <p className="font-bold">Votre réservation a bien été enregistrée !</p>
          <p>Vous allez recevoir une confirmation par mail.</p>
        </div>
      )}

      {/* Cadre général */}
      <div className="bg-white  p-6">
        <h1 className="text-2xl font-bold mb-4" style={{ color: colorPrimary }}>
          Détails de la réservation
        </h1>

        {/* Infos générales */}
        <div className="mb-6 text-sm text-gray-700 space-y-1">
          <p>
            <strong>Numéro de réservation :</strong> {numeroDeReservation || "N/A"}
          </p>
          <p>
            <strong>Date de création :</strong> {createdAtFr}
          </p>
        </div>

        {/* Cadre Séjour */}
        <div className=" shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3" style={{ color: colorPrimary }}>
            <FaCalendarAlt className="inline mr-2" /> Séjour
          </h2>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Nom du séjour :</strong> {sejourTitle}
            </p>
            <p>
              <strong>Tranche d'âge :</strong> {ageGroup}
            </p>
            <p>
              <strong>Date de début :</strong> {startDate}
            </p>
            <p>
              <strong>Date de fin :</strong> {endDate}
            </p>
            <p>
              <strong>Ville de départ :</strong> {city}
            </p>
          </div>
        </div>

        {/* Cadre Infos Mineur & Responsable */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Mineur */}
          <div className=" shadow p-4 space-y-2">
            <h2 className="font-semibold text-lg" style={{ color: colorPrimary }}>
              <FaUserFriends className="inline mr-2" /> Informations du mineur
            </h2>
            {minor ? (
              <>
                <p>
                  <strong>Nom :</strong> {minor.lastName}
                </p>
                <p>
                  <strong>Prénom :</strong> {minor.firstName}
                </p>
                <p>
                  <strong>Date de naissance :</strong> {minor.birthDate || "N/A"}
                </p>
                {minor.sex && (
                  <p>
                    <strong>Sexe :</strong> {minor.sex}
                  </p>
                )}
                <p>
                  <strong>Adresse :</strong> {minor.address}, {minor.city} {minor.postalCode}
                </p>
                {minor.phone && (
                  <p>
                    <strong>Téléphone :</strong> {minor.phone}
                  </p>
                )}
                {minor.importantInfo && (
                  <p>
                    <strong>Infos importantes :</strong> {minor.importantInfo}
                  </p>
                )}
              </>
            ) : (
              <p>Aucune information sur le mineur.</p>
            )}
          </div>

          {/* Responsable légal */}
          <div className=" shadow p-4 space-y-2">
            <h2 className="font-semibold text-lg" style={{ color: colorPrimary }}>
              <FaHome className="inline mr-2" /> Responsable légal
            </h2>
            {legal ? (
              <>
                <p>
                  <strong>Nom :</strong> {legal.lastName}
                </p>
                <p>
                  <strong>Prénom :</strong> {legal.firstName}
                </p>
                <p>
                  <strong>Téléphone :</strong> {legal.phone}
                </p>
                <p>
                  <strong>Email :</strong> {legal.email}
                </p>
                <p>
                  <strong>Relation :</strong>{" "}
                  {legal.relationOther || legal.relation}
                </p>
                {legal.addressDifferent && (
                  <p>
                    <strong>Adresse différente :</strong> {legal.address}, {legal.city} {legal.postalCode}
                  </p>
                )}
              </>
            ) : (
              <p>Aucune information sur le responsable légal.</p>
            )}
          </div>
        </div>

        {/* Cadre Informations financières */}
        <div className=" shadow p-4 mb-6">
          <h2 className="font-semibold text-lg mb-3" style={{ color: colorPrimary }}>
            <FaMoneyBillWave className="inline mr-2" /> Informations financières
          </h2>
          <div className="space-y-2 text-sm">
            {/* Petites lignes style "devis" */}
            <div className="flex justify-between border-b pb-2">
              <span>Prix total à payer</span>
              <span>{formatMontant(payment?.basePrice)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Transport</span>
              <span>{formatMontant(payment?.transportPrice)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Assurance</span>
              <span>{formatMontant(payment?.insuranceFee)}</span>
            </div>
            <div className="flex justify-between pt-2">
              <strong>Total</strong>
              <strong>{formatMontant(payment?.basePrice)}</strong>
            </div>
          </div>

          <div className="mt-4 text-sm space-y-1">
            <p>
              <strong>Mode de paiement :</strong> {paymentMethodLabel}
            </p>
            <p>
              <strong>Option de règlement :</strong> {frequencyLabel}
            </p>
            {payment?.depositValue > 0 && (
              <p>
                <strong>Acompte :</strong> {formatMontant(payment.depositValue)}
              </p>
            )}
            <p>
              <strong>Montant déjà payé :</strong> {formatMontant(payment?.alreadyPaid)}
            </p>
            <p>
              <strong>Reste à payer :</strong> {formatMontant(payment?.remainingValue)}
            </p>
            <p className="text-sm">
              <strong>Statut de paiement :</strong> {traduireStatut(payment?.paymentStatus)}
            </p>
          </div>

          {/* Paiement en cours : bouton Stripe ou instructions chèque/virement */}
          {payment?.remainingValue > 0 && payment?.paymentStatus !== "paid" && (
            <div className="mt-6 p-4  text-sm">
              {options?.paymentMethod === "CB" ? (
                <div>
                  <p className="mb-3">
                    Vous pouvez régler le solde restant par <strong>carte bancaire</strong> :
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const payload = {
                          tokenUnique: token,
                          amount: payment.remainingValue,
                          currency: "eur",
                          sejourTitle: sejourTitle,
                          ageGroup: ageGroup,
                          date: startDate,
                          paymentOption: "rest",
                          metadata: {},
                          customer_email: legal?.email,
                        };

                        const response = await fetch("/api/create-stripe-session", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                        });

                        if (!response.ok) {
                          throw new Error("Erreur lors de la création de la session de paiement.");
                        }

                        const data = await response.json();
                        if (data.url) {
                          window.location.href = data.url;
                        } else {
                          throw new Error("L'URL de paiement est introuvable.");
                        }
                      } catch (error) {
                        console.error("Erreur lors du paiement du solde :", error);
                      }
                    }}
                    className=" cursor-pointer px-4 py-2 bg-[#B8336A] text-white rounded hover:bg-[#A2225A]"
                  >
                    Payer le reste
                  </button>
                </div>
              ) : (
                <div>
                  <p className="mb-3">
                    Vous avez choisi un paiement par <strong>Chèque ou virement</strong>.
                    Il reste <strong>{formatMontant(payment.remainingValue)}</strong> à payer.
                  </p>
                  <div className="mb-2 p-3 border border-dashed border-[#B8336A] rounded">
                    <p className="mb-1 font-semibold">Pour un paiement par chèque :</p>
                    <p className="text-sm">
                      Libeller le chèque à l'ordre de <em>Colocrew</em> et l'envoyer à :
                    </p>
                    <pre className="text-sm mt-1">
Colocrew
1 rue Magenta
93500 Pantin
                    </pre>
                  </div>
                  <div className="mb-2 p-3 border border-dashed border-[#B8336A] rounded">
                    <p className="mb-1 font-semibold">Pour un paiement par virement :</p>
                    <p className="text-sm">IBAN :</p>
                    <pre className="text-sm mt-1">
FR7616958000015867806033040
                    </pre>
                  </div>
                  <p className="text-sm text-[#B8336A] font-semibold">
                    Vous disposez de 15 jours pour envoyer votre règlement, faute de quoi la réservation sera annulée.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Documents Obligatoires */}
      <div className="bg-white mt-6 p-4 rounded shadow-md">
        <DocumentsObligatoires initialDocuments={documents} />
      </div>
    </div>
  );
}
