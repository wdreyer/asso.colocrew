"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { db } from "@/app/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import DocumentsObligatoires from "@/app/components/DocumentsObligatoires";
import Spinner from "@/app/components/layout/Spinner";

import {
  FaCalendarAlt,
  FaUserFriends,
  FaHome,
  FaMoneyBillWave,
  FaTrain,
} from "react-icons/fa";

export default function ReservationPage({ params }) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("justCreated") === "true";
  const router = useRouter();

  const [reservation, setReservation] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [loadingDeposit, setLoadingDeposit] = useState(false);

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

  useEffect(() => {
    if (!token || !justCreated || reservation?.payment?.depositStatus === "paid") return;

    const refreshReservation = async () => {
      try {
        const requete = query(
          collection(db, "reservations"),
          where("tokenUnique", "==", token)
        );
        const snap = await getDocs(requete);
        if (!snap.empty) setReservation(snap.docs[0].data());
      } catch (err) {
        console.error(err);
      }
    };

    const interval = setInterval(refreshReservation, 3000);
    const timeout = setTimeout(() => clearInterval(interval), 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [token, justCreated, reservation?.payment?.depositStatus]);

  useEffect(() => {
    if (!chargement && !reservation) {
      const timer = setTimeout(() => {
        router.push("/reservation");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [chargement, reservation, router]);

  if (chargement) return <Spinner />;

  if (!reservation) {
    return (
      <div className="flex flex-col items-center justify-center h-32">
        <h2 className="text-red-600 p-6">Aucune réservation trouvée ....</h2>
        <h2 className="text-xl font-bold">Redirection en cours...</h2>
      </div>
    );
  }

  const {
    numeroDeReservation,
    createdAt,
    status,
    payment,
    options,
    minor,
    legal,
    documents,
    sejour,
    transport,
  } = reservation || {};

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

  const createdAtFr = formatDateFR(createdAt);
  const sejourTitle = sejour?.name || sejour?.urlSejour || "N/A";
  const ageGroup = sejour?.ageGroup || "N/A";
  const startDate = formatDateFR(sejour?.startDate);
  const endDate = formatDateFR(sejour?.endDate);

  const formatMontant = (val) => {
    if (val === undefined || val === null || val === "") return "N/A";
    const amount = Number(val);
    return Number.isFinite(amount) ? `${amount} €` : `${val} €`;
  };

  let paymentMethodLabel = options?.paymentMethod;
  if (paymentMethodLabel === "CB") paymentMethodLabel = "Carte bancaire";
  else if (paymentMethodLabel === "chequeVirement") paymentMethodLabel = "Chèque ou virement";
  else paymentMethodLabel = "N/A";

  const colorPrimary = "#B8336A";

  const nbEnfants = parseInt(minor?.numberOfChildren, 10) || 1;
  let discountLabel = null;
  if (nbEnfants === 2) discountLabel = "-5%";
  else if (nbEnfants >= 3) discountLabel = "-10%";

  const finalPrice = Number(payment?.validatedPrice || payment?.totalPrice || 0);
  const totalDue = Number(payment?.resteACharge ?? payment?.validatedPrice ?? payment?.totalPrice ?? 0);
  const isPriceCalculated =
    finalPrice > 0 && (payment?.priceStatus === "validated" || status === "validated");
  const isDepositPaid = payment?.depositStatus === "paid";
  const depositAmount = Number(payment?.depositAmount || 100);
  const alreadyPaid = Math.max(Number(payment?.alreadyPaid || 0), isDepositPaid ? depositAmount : 0);
  const calculatedRemaining = Math.max((totalDue || finalPrice) - alreadyPaid, 0);
  const storedRemaining = payment?.remainingValue != null ? Math.max(Number(payment.remainingValue) || 0, 0) : null;
  const remainingToPay = storedRemaining != null
    ? Math.min(storedRemaining, calculatedRemaining)
    : calculatedRemaining;

  // Lance une nouvelle session Stripe acompte 100€
  const handleDepositPayment = async () => {
    setLoadingDeposit(true);
    try {
      const res = await fetch("/api/create-stripe-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUnique: token,
          amount: 100,
          currency: "eur",
          sejourTitle,
          ageGroup,
          startDate: sejour?.startDate,
          endDate: sejour?.endDate,
          transportFee: transport?.fee || 0,
          insuranceOpted: options?.insuranceOpted,
          paymentOption: "deposit",
          customer_email: legal?.email,
          metadata: {
            paymentType: "deposit",
            numeroDeReservation,
          },
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Erreur paiement acompte:", err);
    } finally {
      setLoadingDeposit(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">

      {/* Bannière création */}
      {justCreated && !isDepositPaid && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          <p className="font-bold">Votre demande a bien été enregistrée !</p>
          <p>Payez votre acompte ci-dessous pour bloquer votre place dès maintenant.</p>
        </div>
      )}

      {/* Cadre général */}
      <div className="bg-white p-6">
        <h1 className="text-2xl font-bold mb-4" style={{ color: colorPrimary }}>
          Détail de ma demande
        </h1>

        {/* Infos générales */}
        <div className="mb-6 text-sm text-gray-700 space-y-1">
          <p><strong>Numéro de réservation :</strong> {numeroDeReservation || "N/A"}</p>
          <p><strong>Date de création :</strong> {createdAtFr}</p>
        </div>

        {/* ── BLOC ACOMPTE ─────────────────────────────────────────────── */}
        {isDepositPaid ? (
            /* Acompte déjà payé */
            <div className="border-2 border-green-400 rounded-xl p-5 mb-6 bg-green-50">
              <p className="text-green-700 font-bold text-lg mb-1">
                ✅ Acompte de {depositAmount}€ reçu — votre place est bloquée !
              </p>
              <p className="text-sm text-green-600">
                {isPriceCalculated
                  ? "Le montant restant est affiché plus bas."
                  : "Notre équipe va calculer le prix exact et vous contacter dans les 24h pour le solde restant."}
              </p>
            </div>
          ) : (
            /* Acompte non encore payé */
            <div
              className="rounded-xl p-5 mb-6 shadow-lg"
              style={{ background: "#fff3f8", border: `3px solid ${colorPrimary}` }}
            >
              <p className="font-extrabold text-xl mb-1" style={{ color: colorPrimary }}>
                Bloquez votre place avec l'acompte
              </p>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                Bloquez votre place dès maintenant avec un acompte de{" "}
                <strong>{depositAmount}€</strong>. Il sera déduit du montant final.
                Le prix exact vous sera confirmé par l'équipe ColoCrew.
              </p>

              {/* Bouton Stripe */}
              <button
                onClick={handleDepositPayment}
                disabled={loadingDeposit}
                className="cursor-pointer font-bold py-3 px-7 rounded-full text-white text-sm mb-4 transition hover:opacity-90 disabled:opacity-60"
                style={{ background: colorPrimary }}
              >
                {loadingDeposit ? "Redirection..." : `💳 Payer l'acompte de ${depositAmount}€ par carte`}
              </button>

              {/* Séparateur */}
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest my-3">
                — ou par virement bancaire —
              </p>

              {/* RIB */}
              <div
                className="rounded-lg p-4 text-sm leading-7 text-left"
                style={{ background: "#fafafa", border: "1px dashed #e0ccd5" }}
              >
                <p><strong>Titulaire :</strong> COLOCREW</p>
                <p><strong>IBAN :</strong> FR76 1695 8000 0158 6780 6033 040</p>
                <p><strong>BIC/SWIFT :</strong> QNTOFRP1XXX</p>
                <p><strong>Montant :</strong> {depositAmount}€</p>
                <p>
                  <strong>Référence :</strong>{" "}
                  <span className="font-mono font-bold">{numeroDeReservation}</span>
                </p>
              </div>
            </div>
          )
        }
        {/* ────────────────────────────────────────────────────────────── */}

        {/* Séjour */}
        <div className="shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3" style={{ color: colorPrimary }}>
            <FaCalendarAlt className="inline mr-2" /> Séjour
          </h2>
          <div className="space-y-2 text-sm">
            <p><strong>Nom du séjour :</strong> {sejourTitle}</p>
            <p><strong>Tranche d'âge :</strong> {ageGroup}</p>
            <p><strong>Date de début :</strong> {startDate}</p>
            <p><strong>Date de fin :</strong> {endDate}</p>
          </div>
        </div>

        {/* Transport */}
        {transport && (
          <div className="shadow p-4 mb-6">
            <h2 className="text-lg font-semibold mb-3" style={{ color: colorPrimary }}>
              <FaTrain className="inline mr-2" /> Transport
            </h2>
            <div className="space-y-2 text-sm">
              <p><strong>Ville de départ :</strong> {transport.departureCity || "N/A"}</p>
              <p><strong>Ville de retour :</strong> {transport.returnCity || "N/A"}</p>
              {transport.fee !== undefined && (
                <p><strong>Frais de transport :</strong> {formatMontant(transport.fee)}</p>
              )}
            </div>
          </div>
        )}

        {/* Mineur(s) + Responsable légal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Mineur(s) */}
          <div className="shadow p-4 space-y-2">
            <h2 className="font-semibold text-lg" style={{ color: colorPrimary }}>
              <FaUserFriends className="inline mr-2" /> Informations du ou des mineur(s)
            </h2>
            {minor ? (
              <>
                {minor.numberOfChildren && (
                  <p><strong>Nombre d'enfants :</strong> {minor.numberOfChildren}</p>
                )}
                {Array.isArray(minor.children) && minor.children.length > 0 && (
                  <div className="mt-2 space-y-3">
                    <p className="font-medium">Liste des enfants :</p>
                    {minor.children.map((child, index) => (
                      <div key={index} className="border border-gray-200 rounded p-3 text-sm">
                        <p><strong>Enfant {index + 1}</strong></p>
                        <p><strong>Nom :</strong> {child.lastName || "N/A"}</p>
                        <p><strong>Prénom :</strong> {child.firstName || "N/A"}</p>
                        <p><strong>Date de naissance :</strong> {child.birthDate || "N/A"}</p>
                        <p><strong>Lieu de naissance :</strong> {child.birthPlace || "N/A"}</p>
                        <p>
                          <strong>Adresse :</strong> {child.address || "N/A"}, {child.city || "N/A"}{" "}
                          {child.postalCode || "N/A"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {minor.firstName && (
                  <p><strong>Prénom (single) :</strong> {minor.firstName}</p>
                )}
                {minor.lastName && (
                  <p><strong>Nom (single) :</strong> {minor.lastName}</p>
                )}
                {minor.birthDate && (
                  <p><strong>Date de naissance (single) :</strong> {minor.birthDate}</p>
                )}
                {minor.address && (
                  <p>
                    <strong>Adresse (single) :</strong> {minor.address}, {minor.city} {minor.postalCode}
                  </p>
                )}
              </>
            ) : (
              <p>Aucune information sur le mineur.</p>
            )}
          </div>

          {/* Responsable légal */}
          <div className="shadow p-4 space-y-2">
            <h2 className="font-semibold text-lg" style={{ color: colorPrimary }}>
              <FaHome className="inline mr-2" /> Responsable légal
            </h2>
            {legal ? (
              <>
                <p><strong>Nom :</strong> {legal.lastName}</p>
                <p><strong>Prénom :</strong> {legal.firstName}</p>
                <p><strong>Téléphone :</strong> {legal.phone}</p>
                <p><strong>Email :</strong> {legal.email}</p>
                <p><strong>Relation :</strong> {legal.relation || ""}</p>
                {legal.cafOrSecu && (
                  <p><strong>Numéro Allocataire CAF :</strong> {legal.cafOrSecu}</p>
                )}
                <p><strong>Quotient familial (QF) :</strong> {legal.qf}</p>
                {legal.promoCode && (
                  <p><strong>Code promo :</strong> {legal.promoCode}</p>
                )}
                {legal.addressDifferent && (
                  <p>
                    <strong>Adresse différente :</strong> {legal.address}, {legal.city}{" "}
                    {legal.postalCode}
                  </p>
                )}
                {legal.message && (
                  <p><strong>Message :</strong> {legal.message}</p>
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

        {/* Informations financières */}
        <div className="shadow p-4 mb-6">
          <h2 className="font-semibold text-lg mb-3" style={{ color: colorPrimary }}>
            <FaMoneyBillWave className="inline mr-2" /> Informations financières
          </h2>

          <div className="space-y-2 text-sm">
            {discountLabel && (
              <div className="flex justify-between border-b pb-2 text-green-600">
                <span>Réduction</span>
                <span>{discountLabel}</span>
              </div>
            )}
            <div className="flex justify-between border-b pb-2">
              <span>Transport</span>
              <span>
                {formatMontant(
                  payment?.transportPrice !== undefined ? payment.transportPrice : transport?.fee
                )}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Assurance</span>
              <span>{formatMontant(payment?.insuranceFee)}</span>
            </div>
            {isDepositPaid && (
              <div className="flex justify-between border-b pb-2 text-green-600">
                <span>Acompte versé</span>
                <span>- {depositAmount}€</span>
              </div>
            )}
            {alreadyPaid > depositAmount && (
              <div className="flex justify-between border-b pb-2 text-green-700">
                <span>Autres paiements reçus</span>
                <span>- {formatMontant(alreadyPaid - depositAmount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <strong>{isPriceCalculated ? "Prix validé" : "Estimation"}</strong>
              {isPriceCalculated ? (
                <strong>{formatMontant(finalPrice)}</strong>
              ) : (
                <strong>{payment?.estimatedPriceString || "En cours de calcul"}</strong>
              )}
            </div>
            {isPriceCalculated && (
              <div className="flex justify-between pt-2 text-base">
                <strong>Reste à régler</strong>
                <strong style={{ color: colorPrimary }}>{formatMontant(remainingToPay)}</strong>
              </div>
            )}
          </div>

          <div className="mt-4 text-sm space-y-1">
            <p><strong>Mode de paiement :</strong> {paymentMethodLabel}</p>
            <p>
              <strong>Statut de paiement :</strong>{" "}
              {payment?.paymentStatus === "paid"
                ? "Payé"
                : alreadyPaid > 0
                ? "Acompte reçu — solde à venir"
                : "Non payé"}
            </p>
          </div>

          {/* Paiement du solde (quand le prix est calculé et non encore soldé) */}
          {isPriceCalculated && payment?.paymentStatus !== "paid" && remainingToPay > 0 && (
            <div className="mt-6 p-4 text-sm">
              {options?.paymentMethod === "CB" ? (
                <div>
                  <p className="mb-3">
                    Vous pouvez régler le{" "}
                    <strong>
                      {isDepositPaid ? "solde" : "montant validé"} de{" "}
                      {formatMontant(remainingToPay)}
                    </strong>{" "}
                    par carte bancaire :
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/create-stripe-session", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            tokenUnique: token,
                            amount: remainingToPay,
                            currency: "eur",
                            sejourTitle,
                            ageGroup,
                            startDate: sejour?.startDate,
                            endDate: sejour?.endDate,
                            transportFee: transport?.fee || 0,
                            insuranceOpted: options?.insuranceOpted,
                            paymentOption: isDepositPaid ? "rest" : "oneTime",
                            customer_email: legal?.email,
                          }),
                        });
                        const data = await res.json();
                        if (data.url) window.location.href = data.url;
                      } catch (err) {
                        console.error("Erreur paiement solde:", err);
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
                    Veuillez régler {isDepositPaid ? "le solde" : "le montant validé"} de{" "}
                    <strong>{formatMontant(remainingToPay)}</strong> par{" "}
                    <strong>chèque ou virement</strong> :
                  </p>
                  <div className="mb-2 p-3 border border-dashed border-[#B8336A] rounded">
                    <p className="mb-1 font-semibold">Pour un paiement par chèque :</p>
                    <p className="text-sm">
                      Libellez le chèque à l'ordre de <em>Colocrew</em> et envoyez-le à :
                    </p>
                    <pre className="text-sm mt-1">
Colocrew{"\n"}1 rue Magenta{"\n"}93500 Pantin
                    </pre>
                  </div>
                  <div className="mb-2 p-3 border border-dashed border-[#B8336A] rounded">
                    <p className="mb-1 font-semibold">Pour un paiement par virement :</p>
                    <p className="text-sm leading-7">
                      <strong>IBAN :</strong> FR76 1695 8000 0158 6780 6033 040<br />
                      <strong>BIC :</strong> QNTOFRP1XXX<br />
                      <strong>Montant :</strong> {formatMontant(remainingToPay)}<br />
                      <strong>Référence :</strong> {numeroDeReservation}
                    </p>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: colorPrimary }}>
                    Vous disposez de 15 jours pour envoyer votre règlement, faute de quoi la
                    réservation sera annulée.
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
