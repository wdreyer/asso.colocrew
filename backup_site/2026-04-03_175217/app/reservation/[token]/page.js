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
  FaMoneyBillWave,
  FaTrain,
} from "react-icons/fa";

/**
 * Page de détail d'une réservation
 */
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
    transport, // <-- { departureCity, returnCity, fee? }
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

  // Formatage de la date de création
  const createdAtFr = formatDateFR(createdAt);

  // Informations sur le séjour
  const sejourTitle = sejour?.name || sejour?.urlSejour || "N/A";
  const ageGroup = sejour?.ageGroup || "N/A";
  const startDate = formatDateFR(sejour?.startDate);
  const endDate = formatDateFR(sejour?.endDate);

  // Fonction utilitaire pour formater un montant
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

  // Couleur "brand"
  const colorPrimary = "#B8336A";

  // Déterminer la réduction si besoin
  // minor?.numberOfChildren est une string ou un nombre => on parse
  const nbEnfants = parseInt(minor?.numberOfChildren, 10) || 1;
  let discountLabel = null;
  if (nbEnfants === 2) {
    discountLabel = "-5%";
  } else if (nbEnfants >= 3) {
    discountLabel = "-10%";
  }

  // Savoir si prix calculé ou non
  // => Si payment?.totalPrice > 0 => prix calculé, sinon => en cours
  const isPriceCalculated = payment?.totalPrice && payment.totalPrice > 0;

  console.log(legal.qf)

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
      <div className="bg-white p-6">
        <h1 className="text-2xl font-bold mb-4" style={{ color: colorPrimary }}>
          Détails de la réservation
        </h1>

        {/* Infos générales */}
        <div className="mb-6 text-sm text-gray-700 space-y-1">
          <p>
            <strong>Numéro de réservation :</strong>{" "}
            {numeroDeReservation || "N/A"}
          </p>
          <p>
            <strong>Date de création :</strong> {createdAtFr}
          </p>
        </div>

        {/* Cadre Séjour */}
        <div className="shadow p-4 mb-6">
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
          </div>
        </div>

        {/* Nouveau cadre : Transport (si présent) */}
        {transport && (
          <div className="shadow p-4 mb-6">
            <h2 className="text-lg font-semibold mb-3" style={{ color: colorPrimary }}>
              <FaTrain className="inline mr-2" /> Transport
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Ville de départ :</strong>{" "}
                {transport.departureCity || "N/A"}
              </p>
              <p>
                <strong>Ville de retour :</strong>{" "}
                {transport.returnCity || "N/A"}
              </p>
              {transport.fee !== undefined && (
                <p>
                  <strong>Frais de transport :</strong>{" "}
                  {formatMontant(transport.fee)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Bloc Mineur(s) et Responsable */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Mineur(s) */}
          <div className="shadow p-4 space-y-2">
            <h2 className="font-semibold text-lg" style={{ color: colorPrimary }}>
              <FaUserFriends className="inline mr-2" /> Informations du ou des mineur(s)
            </h2>
            {minor ? (
              <>
                {/* Nombre d'enfants */}
                {minor.numberOfChildren && (
                  <p>
                    <strong>Nombre d'enfants :</strong>{" "}
                    {minor.numberOfChildren}
                  </p>
                )}

                {/* Liste des enfants */}
                {Array.isArray(minor.children) && minor.children.length > 0 && (
                  <div className="mt-2 space-y-3">
                    <p className="font-medium">Liste des enfants :</p>
                    {minor.children.map((child, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 rounded p-3 text-sm"
                      >
                        <p>
                          <strong>Enfant {index + 1}</strong>
                        </p>
                        <p>
                          <strong>Nom :</strong>{" "}
                          {child.lastName || "N/A"}
                        </p>
                        <p>
                          <strong>Prénom :</strong>{" "}
                          {child.firstName || "N/A"}
                        </p>
                        <p>
                          <strong>Date de naissance :</strong>{" "}
                          {child.birthDate || "N/A"}
                        </p>
                        <p>
                          <strong>Lieu de naissance :</strong>{" "}
                          {child.birthPlace || "N/A"}
                        </p>
                        <p>
                          <strong>Adresse :</strong>{" "}
                          {child.address || "N/A"}, {child.city || "N/A"}{" "}
                          {child.postalCode || "N/A"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Anciennes infos single (compatibilité) */}
                {minor.firstName && (
                  <p>
                    <strong>Prénom (single) :</strong> {minor.firstName}
                  </p>
                )}
                {minor.lastName && (
                  <p>
                    <strong>Nom (single) :</strong> {minor.lastName}
                  </p>
                )}
                {minor.birthDate && (
                  <p>
                    <strong>Date de naissance (single) :</strong>{" "}
                    {minor.birthDate}
                  </p>
                )}
                {minor.address && (
                  <p>
                    <strong>Adresse (single) :</strong> {minor.address},{" "}
                    {minor.city} {minor.postalCode}
                  </p>
                )}
              </>
            ) : (
              <p>Aucune information sur le mineur.</p>
            )}
          </div>

          {/* Responsable légal */}
                   {/* Responsable légal */}
          <div className="shadow p-4 space-y-2">
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
                  <strong>Relation :</strong> {legal.relation || ""}
                </p>

                {legal.cafOrSecu && (
                  <p>
                    <strong>Numéro CAF ou Sécu :</strong> {legal.cafOrSecu}
                  </p>
                )}

            
                  <p>
                    <strong>Quotient familial (QF) :</strong> {legal.qf}
                  </p>
              

                {legal.promoCode && (
                  <p>
                    <strong>Code promo :</strong> {legal.promoCode}
                  </p>
                )}

                {legal.addressDifferent && (
                  <p>
                    <strong>Adresse différente :</strong> {legal.address}, {legal.city} {legal.postalCode}
                  </p>
                )}

                {legal.message && (
                  <p>
                    <strong>Message :</strong> {legal.message}
                  </p>
                )}

                {legal.justificatifUrl && (
                  <p>
                    <strong>Justificatif PDF :</strong>{" "}
                    <a
                      href={legal.justificatifUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      Télécharger
                    </a>
                  </p>
                )}
              </>
            ) : (
              <p>Aucune information sur le responsable légal.</p>
            )}
          </div>

        </div>

        {/* Cadre Informations financières */}
        <div className="shadow p-4 mb-6">
          <h2 className="font-semibold text-lg mb-3" style={{ color: colorPrimary }}>
            <FaMoneyBillWave className="inline mr-2" /> Informations financières
          </h2>

          {/* Si le prix n'est pas calculé, on affiche un message orange */}
          {!isPriceCalculated && (
            <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-3 mb-4 flex items-center">
              <span className="mr-2" role="img" aria-label="Sablier">
                ⏳
              </span>
              <p>
                <strong>Le prix est en cours de calcul.</strong> Vous recevrez un mail sous 24h !
              </p>
            </div>
          )}

          <div className="space-y-2 text-sm">
            {/* Si discount */}
            {discountLabel && (
              <div className="flex justify-between border-b pb-2 text-green-600">
                <span>Réduction</span>
                <span>{discountLabel}</span>
              </div>
            )}

            {/* Transport */}
            <div className="flex justify-between border-b pb-2">
              <span>Transport</span>
              <span>
                {formatMontant(
                  payment?.transportPrice !== undefined
                    ? payment.transportPrice
                    : transport?.fee // fallback
                )}
              </span>
            </div>

            {/* Assurance */}
            <div className="flex justify-between border-b pb-2">
              <span>Assurance</span>
              <span>{formatMontant(payment?.insuranceFee)}</span>
            </div>

            {/* Affichage final (si totalPrice > 0, on l'affiche ; sinon, on montre ou "N/A") */}
            <div className="flex justify-between pt-2">
              <strong>Total</strong>
              {isPriceCalculated ? (
                <strong>{formatMontant(payment?.totalPrice)}</strong>
              ) : (
                <strong>
                  {payment?.estimatedPriceString || "En cours de calcul"}
                </strong>
              )}
            </div>
          </div>

          {/* Paiement (mode & statut) */}
          <div className="mt-4 text-sm space-y-1">
            <p>
              <strong>Mode de paiement :</strong> {paymentMethodLabel}
            </p>
            <p>
              <strong>Statut de paiement :</strong>{" "}
              {payment?.paymentStatus === "paid" ? "Payé" : "Non payé"}
            </p>
          </div>

          {
  payment?.paymentStatus !== "paid" &&
  payment?.totalPrice > 0 && (
    <div className="mt-6 p-4 text-sm">
      {options?.paymentMethod === "CB" ? (
        <div>
          <p className="mb-3">
            Vous pouvez régler le montant total par <strong>carte bancaire</strong> :
          </p>
          <button
            onClick={async () => {
              try {
                const payload = {
                  tokenUnique: token,
                  amount: payment.totalPrice,
                  currency: "eur",
                  sejourTitle,
                  ageGroup,
                  date: startDate,
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
                console.error("Erreur lors du paiement :", error);
              }
            }}
            className="cursor-pointer px-4 py-2 bg-[#B8336A] text-white rounded hover:bg-[#A2225A]"
          >
            Payer par carte bancaire
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-3">
            Vous avez choisi un paiement par <strong>Chèque ou virement</strong>.
            Veuillez suivre les instructions ci-dessous :
          </p>
          <div className="mb-2 p-3 border border-dashed border-[#B8336A] rounded">
            <p className="mb-1 font-semibold">Pour un paiement par chèque :</p>
            <p className="text-sm">
              Libellez le chèque à l'ordre de <em>Colocrew</em> et envoyez-le à :
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
    </div>
  );
}
