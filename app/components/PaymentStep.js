"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function PaymentStep({
  formData,
  handleChange,
  selectedDate,
  selectedCity,
  selectedAgeGroup,
  reservationPrice,
  handlePrevStep,
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Fonction finale : enregistre la réservation et envoie l'e-mail
  const handleFinalizeReservation = async () => {
    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      // 1) Créer la réservation (ENDPOINT /api/campBooking/new)
      const newBookingRes = await fetch("/api/campBooking/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.legalEmail,
          mineur: {
            firstName: formData.minorFirstName,
            lastName: formData.minorLastName,
            birthDate: formData.minorBirthDate,
            sex: formData.minorSex,
            address: formData.minorAddress,
            city: formData.minorCity,
            postalCode: formData.minorPostalCode,
            phone: formData.minorPhone,
            importantInfo: formData.minorImportantInfo,
          },
          responsable: {
            firstName: formData.legalFirstName,
            lastName: formData.legalLastName,
            phone: formData.legalPhone,
            email: formData.legalEmail,
            relation: formData.legalRelation,
            relationOther: formData.legalRelationOther,
            addressDifferent: formData.legalAddressDifferent,
            address: formData.legalAddress,
            city: formData.legalCity,
            postalCode: formData.legalPostalCode,
          },
          acompte: 300, 
          resteAPayer: reservationPrice - 300,
          selectedDate,
        selectedCity,
        selectedAgeGroup,
        reservationPrice,
        }),
      });

      const newBookingData = await newBookingRes.json();
      if (newBookingData.error) {
        setErrorMessage(newBookingData.error);
        setIsLoading(false);
        return;
      }

      // 2) Récupère le lienAcces (URL de la résa)
      const lienAcces = `${newBookingData.lienAcces}?justCreated=true`;      if (!lienAcces) {
        setErrorMessage("Aucun lien de réservation reçu.");
        setIsLoading(false);
        return;
      }     
      
router.push(lienAcces);



      // 4) ENVOYER L'E-MAIL en "arrière-plan" (pas de `await`)
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType: "reservation",
          nom: formData.legalLastName,
          prenom: formData.legalFirstName,
          email: formData.legalEmail,
          telephone: formData.legalPhone,
          selectedDate,
          selectedCity,
          reservationPrice,
          lienAcces,
        }),
      })
        .then(() => console.log("E-mail envoyé en parallèle"))
        .catch((err) => console.error("Erreur envoi email:", err));

    } catch (error) {
      console.error(error);
      setErrorMessage("Une erreur est survenue lors de la création de la réservation.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Récapitulatif & Paiement</h2>

      {/* Blabla juridique / administratif */}
      <div className="p-4 bg-gray-50 rounded-md text-sm border border-gray-200">
        <p className="mb-2">
          <strong>Information administrative :</strong>
        </p>
        <p className="text-gray-700 leading-relaxed">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          Curabitur fringilla, velit ac porttitor interdum, ex arcu
          vulputate odio, vitae congue libero turpis ac orci.
          Proin vitae vestibulum lacus. Nunc consequat nisi quis
          venenatis fermentum. Phasellus hendrerit, risus eu ultricies
          lobortis, nisl neque euismod turpis, et euismod urna magna a nisi.
        </p>
      </div>

      {/* Récap en deux colonnes */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-gray-100 rounded-md text-sm">
        {/* Colonne 1 : Séjour + mineur */}
        <div className="space-y-2">
          <p><strong>Date sélectionnée :</strong> {selectedDate}</p>
          <p><strong>Ville de départ :</strong> {selectedCity}</p>
          <p><strong>Tranche d'âge :</strong> {selectedAgeGroup}</p>
          <p><strong>Prix total :</strong> {reservationPrice} €</p>

          <hr className="my-2" />

          <p className="font-semibold">Mineur :</p>
          <p>
            <strong>Nom :</strong> {formData.minorFirstName} {formData.minorLastName}
          </p>
          <p>
            <strong>Date de naissance :</strong> {formData.minorBirthDate}
          </p>
          <p>
            <strong>Sexe :</strong> {formData.minorSex}
          </p>
          <p>
            <strong>Adresse :</strong> {formData.minorAddress}, {formData.minorCity} {formData.minorPostalCode}
          </p>
          {formData.minorPhone && (
            <p><strong>Téléphone :</strong> {formData.minorPhone}</p>
          )}
          {formData.minorImportantInfo && (
            <p><strong>Infos :</strong> {formData.minorImportantInfo}</p>
          )}
        </div>

        {/* Colonne 2 : Responsable légal */}
        <div className="space-y-2">
          <p className="font-semibold">Responsable légal :</p>
          <p>
            <strong>Nom :</strong> {formData.legalFirstName} {formData.legalLastName}
          </p>
          <p><strong>Téléphone :</strong> {formData.legalPhone}</p>
          <p><strong>Email :</strong> {formData.legalEmail}</p>
          <p>
            <strong>Relation :</strong>{" "}
            {formData.legalRelation === "autre" && formData.legalRelationOther
              ? formData.legalRelationOther
              : formData.legalRelation}
          </p>
          {formData.legalAddressDifferent && (
            <p>
              <strong>Adresse :</strong> {formData.legalAddress}, {formData.legalCity} {formData.legalPostalCode}
            </p>
          )}
        </div>
      </div>

      {/* Choix de paiement */}
      <div className="flex items-center">
        <label className="w-1/3 text-sm font-medium">Mode de paiement</label>
        <select
          name="paymentMethod"
          value={formData.paymentMethod}
          onChange={handleChange}
          className="w-2/3 border border-gray-300 rounded-md p-2"
        >
          <option value="Carte Bleue">Carte Bleue</option>
          <option value="Virement">Virement</option>
        </select>
      </div>

      {/* Case à cocher CGV */}
      <div className="flex items-center mt-4">
        <input
          type="checkbox"
          id="acceptedCGV"
          name="acceptedCGV"
          checked={formData.acceptedCGV}
          onChange={handleChange}
          className="h-4 w-4 mr-2"
          required
        />
        <label htmlFor="acceptedCGV" className="text-sm">
          J'accepte les conditions générales de vente
        </label>
      </div>

      {/* Case à cocher documents demandés */}
      <div className="flex items-center mt-4">
        <input
          type="checkbox"
          id="acceptedDocs"
          name="acceptedDocs"
          checked={formData.acceptedDocs}
          onChange={handleChange}
          className="h-4 w-4 mr-2"
          required
        />
        <label htmlFor="acceptedDocs" className="text-sm">
          Je m’engage à envoyer les documents demandés
        </label>
      </div>

      {/* BOUTONS (Précédent + Valider) sur la même ligne */}
      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={handlePrevStep}
          className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
        >
          Précédent
        </button>
        <button
          onClick={handleFinalizeReservation}
          disabled={isLoading}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
        >
          {isLoading ? "Envoi en cours..." : "Valider la réservation"}
        </button>
      </div>

      {/* Message d'erreur / succès */}
      {errorMessage && (
        <p className="text-red-600 mt-2">{errorMessage}</p>
      )}
      {successMessage && (
        <p className="text-green-600 mt-2">{successMessage}</p>
      )}
    </div>
  );
}
