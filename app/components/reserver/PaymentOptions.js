"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaShieldAlt, FaCreditCard, FaMoneyCheck } from "react-icons/fa";
import {
  applyPriceRangeAdjustments,
  formatPriceNumber,
  formatPriceRange,
  resolveSejourPriceRange,
} from "@/src/lib/pricing";

export default function PaymentOptions({
  formData,
  handleChange,
  sejour,
  transportFee,
  insuranceFee,
  numberOfChildren,
  selectedStartDate,
  onEstimatedPriceChange,
}) {
  const validPromo50 = ["NOEL"];
  const promoInput = (formData?.legal?.promoCode || "").trim().toUpperCase();
  const hasPromo50 = validPromo50.includes(promoInput);
  const flatDiscount = hasPromo50 ? 50 : 0;

  const discountFactor = useMemo(() => {
    if (numberOfChildren === 2) return 0.95;
    if (numberOfChildren >= 3) return 0.9;
    return 1;
  }, [numberOfChildren]);

  const baseRange = useMemo(
    () => resolveSejourPriceRange(sejour, selectedStartDate),
    [sejour, selectedStartDate],
  );

  const hasBaseRange = baseRange.min > 0 || baseRange.max > 0;

  const estimatedRange = useMemo(
    () =>
      applyPriceRangeAdjustments(baseRange, {
        discountFactor,
        transportFee,
        insuranceFee: formData?.insuranceOpted ? insuranceFee : 0,
        flatDiscount,
      }),
    [baseRange, discountFactor, transportFee, formData?.insuranceOpted, insuranceFee, flatDiscount],
  );

  const calculatedPriceString = hasBaseRange
    ? `de ${formatPriceRange(estimatedRange)}`
    : "En cours de calcul";

  const [priceString, setPriceString] = useState(calculatedPriceString);

  useEffect(() => {
    setPriceString(calculatedPriceString);
    onEstimatedPriceChange?.(calculatedPriceString);
  }, [calculatedPriceString, onEstimatedPriceChange]);

  const discountLines = [];
  if (numberOfChildren === 2) {
    discountLines.push(
      <div key="kids2" className="border-b border-gray-200 py-2 flex justify-between text-green-600">
        <span>Réduction 2 enfants</span>
        <span>-5 %</span>
      </div>,
    );
  } else if (numberOfChildren >= 3) {
    discountLines.push(
      <div key="kids3" className="border-b border-gray-200 py-2 flex justify-between text-green-600">
        <span>Réduction 3 enfants et +</span>
        <span>-10 %</span>
      </div>,
    );
  }
  if (hasPromo50) {
    discountLines.push(
      <div key="promo50" className="border-b border-gray-200 py-2 flex justify-between text-green-600 font-semibold">
        <span>Code promo ({formData.legal.promoCode.trim()})</span>
        <span>-50 €</span>
      </div>,
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow mb-6">
      <h2 className="text-2xl font-bold text-[#B8336A] mb-4">Récapitulatif</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col divide-y divide-gray-200 pr-6 md:border-r border-gray-200">
          <div className="py-4">
            <p className="text-sm font-semibold mb-2">
              Méthode de paiement<span className="text-red-500 ml-1">*</span> :
            </p>
            <div className="flex items-center space-x-4">
              {[
                { value: "CB", label: "Carte Bancaire", Icon: FaCreditCard },
                { value: "chequeVirement", label: "Virement", Icon: FaMoneyCheck },
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
            <span className="text-xs">
              Vous aurez la possibilité de changer le mode de règlement plus tard.
            </span>
          </div>

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
                Montant : {formatPriceNumber(insuranceFee)} € (
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

        <div className="space-y-4 md:pl-6">
          <div className="border border-gray-200 p-4 rounded text-sm">
            <h3 className="text-lg font-bold mb-3">Détail du prix</h3>

            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Prix de base</span>
              <span>{hasBaseRange ? formatPriceRange(baseRange) : "En cours de calcul"}</span>
            </div>

            {discountLines}

            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Transport</span>
              <span>{formatPriceNumber(transportFee)} €</span>
            </div>

            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Assurance annulation</span>
              <span>{formData.insuranceOpted ? formatPriceNumber(insuranceFee) : "0"} €</span>
            </div>

            <div className="pt-3 flex justify-end">
              <div className="text-right">
                <p className="text-sm uppercase font-light">Total estimé</p>
                <p className="text-xl font-extrabold text-[#B8336A]">{priceString}</p>
                <span className="text-xs mt-1 text-gray-600">Par enfant</span>
                <p className="text-xs mt-1 text-gray-600">
                  Le total définitif sera calculé sous 24 h ; un lien de paiement vous sera ensuite envoyé.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

