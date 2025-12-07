"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { FaShieldAlt, FaCreditCard, FaMoneyCheck } from "react-icons/fa";

export default function PaymentOptions({
  formData,
  handleChange,
  sejour,
  transportFee,
  insuranceFee,
  numberOfChildren,
  urlAgeGroup,
  onEstimatedPriceChange, // callback fourni par le parent
}) {
  /* ────────────────────────────────────────────────────────────────
     1) Code-promo fixe 50 €
  ────────────────────────────────────────────────────────────────── */
  const validPromo50 = ["NOEL" ];             // tous en MAJ
  const promoInput = (formData.legal.promoCode || "").trim().toUpperCase();
  const hasPromo50 = validPromo50.includes(promoInput);

  const flatDiscount = hasPromo50 ? 50 : 0;

  /* ────────────────────────────────────────────────────────────────
     2) Parsing du basePrice (ex : "590-1200")
  ────────────────────────────────────────────────────────────────── */
  const basePriceString = sejour?.basePrice || "0-0";
  const parsedRange = parseBasePriceRange(basePriceString); // {min,max}|null

  /* ────────────────────────────────────────────────────────────────
     3) Réduction % enfants
  ────────────────────────────────────────────────────────────────── */
  let discountFactor = 1;
  if (numberOfChildren === 2) discountFactor = 0.95;
  else if (numberOfChildren >= 3) discountFactor = 0.9;

  /* ────────────────────────────────────────────────────────────────
     4) Calcul fourchette min/max (enfants + transport + assurance − promo)
  ────────────────────────────────────────────────────────────────── */
  let minEstime = 0;
  let maxEstime = 0;
  if (parsedRange) {
    const baseMin = parsedRange.min * discountFactor;
    const baseMax = parsedRange.max * discountFactor;

    let minWithExtras =
      baseMin + transportFee + (formData.insuranceOpted ? insuranceFee : 0);
    let maxWithExtras =
      baseMax + transportFee + (formData.insuranceOpted ? insuranceFee : 0);

    minEstime = Math.max(0, minWithExtras - flatDiscount);
    maxEstime = Math.max(0, maxWithExtras - flatDiscount);
  }

  /* ────────────────────────────────────────────────────────────────
     5) Construction des lignes de réductions (enfants + promo)
  ────────────────────────────────────────────────────────────────── */
  const discountLines = [];
  if (numberOfChildren === 2) {
    discountLines.push(
      <div
        key="kids2"
        className="border-b border-gray-200 py-2 flex justify-between text-green-600"
      >
        <span>Réduction&nbsp;2&nbsp;enfants</span>
        <span>-5&nbsp;%</span>
      </div>
    );
  } else if (numberOfChildren >= 3) {
    discountLines.push(
      <div
        key="kids3"
        className="border-b border-gray-200 py-2 flex justify-between text-green-600"
      >
        <span>Réduction&nbsp;3&nbsp;enfants&nbsp;et&nbsp;+</span>
        <span>-10&nbsp;%</span>
      </div>
    );
  }
  if (hasPromo50) {
    discountLines.push(
      <div
        key="promo50"
        className="border-b border-gray-200 py-2 flex justify-between text-green-600 font-semibold"
      >
        <span>Code&nbsp;promo&nbsp;({formData.legal.promoCode.trim()})</span>
        <span>-50&nbsp;€</span>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────
     6) Conditions selon la méthode de paiement
  ────────────────────────────────────────────────────────────────── */
  let paymentConditions;
  if (formData.paymentMethod === "chequeVirement") {
    paymentConditions = (
      <>
        <p>
          <strong>Règlement par Chèque / Virement.</strong>
        </p>
        <p>
          Vous disposez de 15&nbsp;jours pour envoyer votre règlement à
          réception du prix total, faute de quoi l’inscription sera annulée.
        </p>
        <p>
          Conditions d’annulation&nbsp;: remboursement intégral (−80&nbsp;€)
          jusqu’à 90&nbsp;jours avant le séjour. Au-delà&nbsp;: voir CGV.
        </p>
      </>
    );
  } else {
    paymentConditions = (
      <>
        <p>
          <strong>Règlement par Carte Bancaire.</strong>
        </p>
        <p>
          Vous disposez de 48&nbsp;h dès réception du lien pour procéder au
          paiement ; règlement en 3× sans frais possible via Klarna.
        </p>
        <p>
          Conditions d’annulation&nbsp;: remboursement intégral (−80&nbsp;€)
          jusqu’à 90&nbsp;jours avant le séjour. Au-delà&nbsp;: voir CGV.
        </p>
        <p>Les paiements CB sont gérés par nos partenaires&nbsp;:</p>
      </>
    );
  }

  /* ────────────────────────────────────────────────────────────────
     7) Chaîne du prix estimé
  ────────────────────────────────────────────────────────────────── */
  const calculatedPriceString = parsedRange
    ? `de ${formatPriceRange(minEstime, maxEstime)} €`
    : `${sejour.basePrice} €`;

  /* ────────────────────────────────────────────────────────────────
     8) Propagation au parent
  ────────────────────────────────────────────────────────────────── */
  const [priceString, setPriceString] = useState(calculatedPriceString);
  useEffect(() => {
    setPriceString(calculatedPriceString);
    onEstimatedPriceChange?.(calculatedPriceString);
  }, [calculatedPriceString, onEstimatedPriceChange]);

  /* ────────────────────────────────────────────────────────────────
     9) Rendu UI
  ────────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow mb-6">
      {/* Message Klarna */}


      <h2 className="text-2xl font-bold text-[#B8336A] mb-4">
       Récapitulatif
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ╭────────── Colonne GAUCHE ─────────╮ */}
        <div className="flex flex-col divide-y divide-gray-200 pr-6 md:border-r border-gray-200">
          {/* Choix de paiement */}
          <div className="py-4">
            <p className="text-sm font-semibold mb-2">
              Méthode de paiement<span className="text-red-500 ml-1">*</span> :
            </p>
            <div className="flex items-center space-x-4">
              {[
                { value: "CB", label: "Carte Bancaire", Icon: FaCreditCard },
                {
                  value: "chequeVirement",
                  label: "Virement",
                  Icon: FaMoneyCheck,
                },
              ].map(({ value, label, Icon }) => (
                <label key={value} className="inline-flex items-center text-sm">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={value}
                    checked={formData.paymentMethod === value}
                    onChange={handleChange}
                    className="form-radio h-5 w-5 text-[#B8336A]"
                  />
                  <span className="ml-2 flex items-center">
                    <Icon className="mr-1 text-[#B8336A]" /> {label}
                  </span>

                </label>
              ))}

            </div>
            <span className=" text-xs ">Vous aurez la possibilité de changer le mode de réglement plus tard</span> 

          </div>

          {/* Assurance annulation */}
          <div className="py-4 flex items-start">
            <input
              type="checkbox"
              name="insuranceOpted"
              checked={formData.insuranceOpted}
              onChange={handleChange}
              className="form-checkbox h-5 w-5 text-[#B8336A] mt-1"
            />
            <label className="ml-2 text-sm leading-snug">
              <span className="font-semibold inline-flex items-center mb-1">
                <FaShieldAlt className="mr-1 text-[#B8336A]" />
                Souscrire à l’assurance annulation
              </span>
              <span className="block">
                Montant&nbsp;: {insuranceFee} € (
                <Link
                  href="/AssuranceAnnulationMaif.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B8336A] underline"
                >
                  Voir document
                </Link>
                )
              </span>
            </label>
          </div>

          {/* CGV / Docs / Rétractation / RGPD */}
          <div className="py-4 text-xs space-y-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="acceptedCGV"
                checked={formData.acceptedCGV}
                onChange={handleChange}
                className="form-checkbox h-4 w-4 text-[#B8336A]"
              />
              <span className="ml-2">
                J’accepte les{" "}
                <Link
                  href="/conditions-generales-de-ventes"
                  target="_blank"
                  className="text-[#B8336A] underline"
                >
                  CGV
                </Link>
                <span className="text-red-500 ml-1">*</span>
              </span>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="acceptedRGPD"
                checked={formData.acceptedRGPD}
                onChange={handleChange}
                className="form-checkbox h-4 w-4 text-[#B8336A]"
              />
              <span className="ml-2">
                J’accepte la{" "}
                <Link href="/rgpd" target="_blank" className="text-[#B8336A] underline">
                  politique de confidentialité (RGPD)
                </Link>
                <span className="text-red-500 ml-1">*</span>
              </span>
            </div>


          </div>
        </div>

        {/* ╭────────── Colonne DROITE ─────────╮ */}
        <div className="space-y-4 md:pl-6">
          <div className="border border-gray-200 p-4 rounded text-sm">
            <h3 className="text-lg font-bold mb-3">Détail du prix</h3>

            {/* Prix de base */}
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Prix de base</span>
              <span>{sejour.basePrice} €</span>
            </div>

            {/* Réductions */}
            {discountLines}

            {/* Transport */}
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Transport</span>
              <span>{transportFee} €</span>
            </div>

            {/* Assurance */}
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Assurance annulation</span>
              <span>{formData.insuranceOpted ? insuranceFee : 0} €</span>
            </div>

            {/* Total estimé */}
            <div className="pt-3 flex justify-end">
              <div className="text-right">
                <p className="text-sm uppercase font-light">Total estimé</p>
                <p className="text-xl font-extrabold text-[#B8336A]">
                  {priceString}
                </p>
                <span className="text-xs mt-1 text-gray-600">Par enfant</span>
                <p className="text-xs mt-1 text-gray-600">
                  Le total définitif sera calculé sous 24&nbsp;h ; un lien de
                  paiement vous sera ensuite envoyé.
                </p>
              </div>
            </div>
          </div>

          {/* Logos Klarna / Stripe */}
          {/* {formData.paymentMethod === "CB" && (
            <div className="border border-gray-200 p-4 rounded text-center">
              <div className="flex items-center justify-center space-x-4">
                <Link
                  href="https://www.klarna.com/fr/politique-de-protection-de-lacheteur-klarna/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image src="/klarna.png" alt="Klarna" width={64} height={64} />
                </Link>
                <Link
                  href="https://stripe.com/fr/customers"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image src="/stripe.svg" alt="Stripe" width={64} height={64} />
                </Link>
              </div>
            </div>
          )} */}

          {/* Conditions dynamiques */}
          {/* <div className="border border-gray-200 p-4 rounded text-xs leading-snug whitespace-pre-line">
            {paymentConditions}
          </div> */}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── UTILITAIRES ─────────────────── */
function parseBasePriceRange(str) {
  const m = str.match(/(\d+)\D+(\d+)/);
  if (!m) return null;
  const min = +m[1],
    max = +m[2];
  return isNaN(min) || isNaN(max) ? null : { min, max };
}
function formatPriceRange(min, max) {
  const a = Math.round(min);
  const b = Math.round(max);
  return a === b ? `${a}` : `${a} à ${b}`;
}
