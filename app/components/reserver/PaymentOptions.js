"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import {
  FaShieldAlt,
  FaCreditCard,
  FaMoneyCheck,
} from "react-icons/fa";

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
  // ─────────────────────────────────────────────────────────────────
  // 1) Parsing du basePrice (ex: "590-1200")
  // ─────────────────────────────────────────────────────────────────
  const basePriceString = sejour?.basePrice || "0-0"; 
  const parsedRange = parseBasePriceRange(basePriceString); 
  // { min: 590, max: 1200 } ou null

  // ─────────────────────────────────────────────────────────────────
  // 2) Calcul de la réduction
  // ─────────────────────────────────────────────────────────────────
  let discountFactor = 1;
  if (numberOfChildren === 2) {
    discountFactor = 0.95;
  } else if (numberOfChildren >= 3) {
    discountFactor = 0.9;
  }

  // ─────────────────────────────────────────────────────────────────
  // 3) Calcul fourchette min/max
  // ─────────────────────────────────────────────────────────────────
  let minEstime = 0;
  let maxEstime = 0;

  if (parsedRange) {
    const baseMin = parsedRange.min * discountFactor;
    const baseMax = parsedRange.max * discountFactor;

    let minWithTransport = baseMin + transportFee;
    let maxWithTransport = baseMax + transportFee;

    if (formData.insuranceOpted) {
      minWithTransport += insuranceFee;
      maxWithTransport += insuranceFee;
    }

    minEstime = minWithTransport;
    maxEstime = maxWithTransport;
  }

  // ─────────────────────────────────────────────────────────────────
  // 4) Ligne de réduction
  // ─────────────────────────────────────────────────────────────────
  let discountLine = null;
  if (numberOfChildren === 2) {
    discountLine = (
      <div className="border-b border-gray-200 py-2 flex justify-between  text-green-600">
        <span>Réduction pour 2 enfants</span>
        <span>-5%</span>
      </div>
    );
  } else if (numberOfChildren >= 3) {
    discountLine = (
      <div className="border-b border-gray-200 py-2 flex justify-between text-green-600">
        <span>Réduction pour 3 enfants et plus</span>
        <span>-10%</span>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 5) Texte final selon la méthode de paiement
  // ─────────────────────────────────────────────────────────────────
  let paymentConditions;
  if (formData.paymentMethod === "chequeVirement") {
    paymentConditions = (
      <>
        <p>
          <strong>Règlement par Chèque / Virement.</strong>
        </p>
        <p>
          Vous disposez de 15 jours pour envoyer votre règlement à partir de la
          réception du prix total, faute de quoi l’inscription sera annulée.
        </p>
        <p>
          Conditions d’annulation : remboursement intégral (moins 80 €) jusqu’à 90
          jours avant le séjour. Au-delà, se reporter aux CGV.
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
          Vous disposez de 48h dès réception du lien pour procéder au paiement, il
          vous est possible de régler en 3X sans frais avec notre partenaire
          Klarna.
        </p>
        <p>
          Conditions d’annulation : remboursement intégral (moins 80 €) jusqu’à 90
          jours avant le séjour. Au-delà, se reporter aux CGV.
        </p>
        <p>
          Les paiements en CB sont gérés par nos partenaires :
        </p>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 6) Construire la chaîne de prix (ex: "de 600 à 1200 €")
  // ─────────────────────────────────────────────────────────────────
  let calculatedPriceString = "";
  if (parsedRange) {
    calculatedPriceString = `de ${formatPriceRange(minEstime, maxEstime)} €`;
  } else {
    // Si on n'a pas pu parser (ou basePrice = "0-0"), on fait un fallback
    calculatedPriceString = sejour.basePrice + " €";
  }

  // ─────────────────────────────────────────────────────────────────
  // 7) useState + effet pour propager le priceString
  // ─────────────────────────────────────────────────────────────────
  const [priceString, setPriceString] = useState("");

  useEffect(() => {
    setPriceString(calculatedPriceString);
    if (onEstimatedPriceChange) {
      onEstimatedPriceChange(calculatedPriceString);
    }
  }, [calculatedPriceString, onEstimatedPriceChange]);

  // ─────────────────────────────────────────────────────────────────
  // 8) Rendu
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow mb-6">
      {/* Message sur Klarna */}
      <p className="text-center text-sm text-blue-700 mb-4">
        Paiement en 3 fois sans frais possible par carte bancaire (choisir Klarna lors du paiement)
      </p>

      <h2 className="text-2xl font-bold text-[#B8336A] mb-4">
        Options de paiement & Récapitulatif
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Colonne GAUCHE */}
        <div className="flex flex-col divide-y divide-gray-200 pr-6 md:border-r border-gray-200">
          {/* Choix de paiement */}
          <div className="py-4">
            <p className="text-sm font-semibold mb-2">
              Méthode de paiement<span className="text-red-500 ml-1">*</span> :
            </p>
            <div className="flex items-center space-x-4">
              <label className="inline-flex items-center text-sm">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CB"
                  checked={formData.paymentMethod === "CB"}
                  onChange={handleChange}
                  className="form-radio h-5 w-5 text-[#B8336A]"
                />
                <span className="ml-2 flex items-center">
                  <FaCreditCard className="mr-1 text-[#B8336A]" />
                  Carte Bancaire
                </span>
              </label>
              <label className="inline-flex items-center text-sm">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="chequeVirement"
                  checked={formData.paymentMethod === "chequeVirement"}
                  onChange={handleChange}
                  className="form-radio h-5 w-5 text-[#B8336A]"
                />
                <span className="ml-2 flex items-center">
                  <FaMoneyCheck className="mr-1 text-[#B8336A]" />
                  Chèque / Virement
                </span>
              </label>
            </div>
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
                Souscrire à l’assurance annulation (facultative)
              </span>
              <span className="block">
                Montant : {insuranceFee} € (
                <a
                  href="/AssuranceAnnulationMaif.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B8336A] underline"
                >
                  Voir document
                </a>
                )
              </span>
            </label>
          </div>

          {/* CGV, docs, noWithdrawal, RGPD */}
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
                J'accepte les{" "}
                <a
                  href="/conditions-generales-de-ventes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B8336A] underline"
                >
                  CGV
                </a>
                <span className="text-red-500 ml-1">*</span>
              </span>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                name="acceptedDocs"
                checked={formData.acceptedDocs}
                onChange={handleChange}
                className="form-checkbox h-4 w-4 text-[#B8336A]"
              />
              <span className="ml-2">
                Je m’engage à envoyer les documents demandés
                <span className="text-red-500 ml-1">*</span>
              </span>
            </div>
            <div className="flex items-start">
              <input
                type="checkbox"
                name="acceptedNoWithdrawal"
                checked={formData.acceptedNoWithdrawal}
                onChange={handleChange}
                className="form-checkbox h-4 w-4 text-[#B8336A] mt-0.5"
              />
              <span className="ml-2 leading-snug">
                Je reconnais que, conformément à l'article L221‑28 du Code de la consommation, le droit de rétractation ne s'applique pas aux séjours de vacances.
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
                J'accepte la{" "}
                <a
                  href="/rgpd"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B8336A] underline"
                >
                  politique de confidentialité (RGPD)
                </a>
                <span className="text-red-500 ml-1">*</span>
              </span>
            </div>
            <p className="mt-2 pt-4">
              <Link
                href="/aide-financement"
                className=" text-center font-bold font-poppins cursor-pointer md:w-auto text-[#B8336A] hover:text-[#A2225A] transition duration-300"
              >
                <span>
                  Si vous êtes éligible à une aide (Pass Colo, VACAF, etc.), nous contacter !
                </span>
              </Link>
            </p>
          </div>
        </div>

        {/* Colonne DROITE : Détail du prix */}
        <div className="space-y-4 md:pl-6">
          <div className="border border-gray-200 p-4 rounded text-sm">
            <h3 className="text-lg font-bold mb-3">Détail du prix</h3>

            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Prix de base</span>
              <span>{sejour.basePrice} €</span>
            </div>
            {discountLine}
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Transport</span>
              <span>{transportFee} €</span>
            </div>
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Assurance annulation</span>
              <span>{formData.insuranceOpted ? insuranceFee : 0} €</span>
            </div>

            <div className="pt-3 flex justify-end">
              <div className="text-right">
                <p className="text-sm uppercase font-light">Total estimé</p>
                <p className="text-xl font-extrabold text-[#B8336A]">
                  {calculatedPriceString}
                </p>
                <span className="text-xs mt-1 text-gray-600">Par enfant</span>
                <p className="text-xs mt-1 text-gray-600">
                  Le total définitif sera calculé sous 24h,<br />
                  et un lien vous sera envoyé !
                </p>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 p-4 rounded text-xs leading-snug whitespace-pre-line">
            {paymentConditions}

            {formData.paymentMethod === "CB" && (
              <div className="mt-4 text-center">
                <div className="flex items-center justify-center space-x-4">
                  <a
                    href="https://www.klarna.com/fr/politique-de-protection-de-lacheteur-klarna/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      src="/klarna.png"
                      alt="Klarna"
                      width={64}
                      height={64}
                    />
                  </a>
                  <a
                    href="https://stripe.com/fr/customers"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      src="/stripe.svg"
                      alt="Stripe"
                      width={64}
                      height={64}
                    />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 
 * parseBasePriceRange:
 * Ex: "590-1200", "590 à 1200", "590 / 1200" => { min: 590, max: 1200 }
 */
function parseBasePriceRange(basePriceStr) {
  const match = basePriceStr.match(/(\d+)\D+(\d+)/);
  if (!match) return null;
  const min = parseFloat(match[1]);
  const max = parseFloat(match[2]);
  if (isNaN(min) || isNaN(max)) return null;
  return { min, max };
}

/**
 * formatPriceRange:
 * Ex: min=600, max=1200 => "600 à 1200"
 */
function formatPriceRange(minVal, maxVal) {
  const minStr = Math.round(minVal);
  const maxStr = Math.round(maxVal);
  if (minStr === maxStr) return minStr.toString();
  return `${minStr} à ${maxStr}`;
}
