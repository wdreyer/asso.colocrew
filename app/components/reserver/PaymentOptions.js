"use client";

import Link from "next/link";
import Image from "next/image";
import { FaShieldAlt, FaCreditCard, FaMoneyCheck } from "react-icons/fa";

export default function PaymentOptions({
  formData,
  handleChange,
  basePrice,
  transportFee,
  computedTotalPrice,
  insuranceFee,
  urlCity,
  urlStartDate,
}) {
  // Calcul de la date limite J-90 si urlStartDate est valide (pour information éventuelle)
  let paymentDeadlineString = "";
  if (urlStartDate) {
    const sejourStart = new Date(urlStartDate);
    if (!Number.isNaN(sejourStart.getTime())) {
      const deadline = new Date(sejourStart);
      deadline.setDate(deadline.getDate() - 90);
      paymentDeadlineString = deadline.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  }

  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow mb-6">
      {/* Mention paiement en 3 fois sans frais (affichage discret) */}
      <p className="text-center text-sm text-blue-700 mb-4">
        Paiement en 3 fois sans frais possible par carte bancaire (choisir Klarna à la page suivante)
      </p>

      <h2 className="text-2xl font-bold text-[#B8336A] mb-4">
        Options de paiement & Récapitulatif
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Colonne GAUCHE : Choix utilisateur */}
        <div className="flex flex-col divide-y divide-gray-200 pr-6 md:border-r border-gray-200">
          {/* Méthode de paiement */}
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

          {/* Assurance annulation (facultative) */}
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

          {/* CGV, Documents, Rétractation et RGPD */}
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
                className="text-xl text-center font-bold font-poppins cursor-pointer md:w-auto text-[#B8336A] hover:text-[#A2225A] transition duration-300"
              >
                <span>
                  Si vous êtes éligible à une aide (Pass Colo, VACAF, etc.), nous contacter !
                </span>
              </Link>
            </p>
          </div>
        </div>

        {/* Colonne DROITE : Détails & récapitulatif */}
        <div className="space-y-4 md:pl-6">
          {/* Détail du prix */}
          <div className="border border-gray-200 p-4 rounded text-sm">
            <h3 className="text-lg font-bold mb-3">Détail du prix</h3>
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Prix de base</span>
              <span>{basePrice} €</span>
            </div>
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Transport A/R vers {urlCity || "Sur place"}</span>
              <span>{transportFee} €</span>
            </div>
            <div className="border-b border-gray-200 py-2 flex justify-between">
              <span>Assurance annulation</span>
              <span>{formData.insuranceOpted ? insuranceFee : 0} €</span>
            </div>
            <div className="pt-3 flex justify-end">
              <div className="text-right">
                <p className="text-sm uppercase font-light">Total</p>
                <p className="text-xl font-extrabold text-[#B8336A]">
                  {computedTotalPrice} €
                </p>
              </div>
            </div>
          </div>

          {/* Informations paiement */}
          <div className="border border-gray-200 p-4 rounded text-xs leading-snug">
            <strong>Paiement en une fois :</strong>
            <br />
            Le montant total doit être payé dès la réservation.
            <br />
            Règlement par{" "}
            {formData.paymentMethod === "CB"
              ? "Carte Bancaire"
              : "Chèque / Virement"}
            .{" "}
            {formData.paymentMethod === "chequeVirement" && (
              <span className="block mt-1">
                Vous disposez de <strong>15 jours</strong> pour envoyer votre règlement, faute de quoi l’inscription sera annulée.
              </span>
            )}
            <br />
            Conditions d’annulation : remboursement intégral (moins 80 €) jusqu’à 90 jours avant le séjour. Au-delà, se reporter aux CGV.
            
            {/* Affichage des logos uniquement si paiement par CB */}
            {formData.paymentMethod === "CB" && (
              <div className="mt-4">
                <p className="text-center text-sm mb-2">
                  Les paiements en CB sont gérés par nos partenaires :
                </p>
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
