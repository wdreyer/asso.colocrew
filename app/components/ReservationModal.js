"use client";
import { useState } from "react";
import PaymentStep from "./PaymentStep"; // <-- Import du composant PaymentStep

export default function ReservationModal({
  setIsModalOpen,
  selectedDate,
  selectedCity,
  selectedAgeGroup,
  reservationPrice,
}) {
  // État de l'avancement du formulaire
  const [formStep, setFormStep] = useState(1);

  // État du formulaire complet + pré-remplissage (exemple)
  const [formData, setFormData] = useState({
    // Mineur (champs obligatoires sauf téléphone et infos)
    minorFirstName: "Jean",
    minorLastName: "Dupont",
    minorSex: "Fille",
    minorBirthDate: "2010-01-01",
    minorBirthPlace: "Paris",
    minorPhone: "",
    minorImportantInfo: "",
    minorAddress: "12 rue des Lilas",
    minorCity: "Bordeaux",
    minorPostalCode: "33000",

    // Responsable légal (tout obligatoire)
    legalFirstName: "Marie",
    legalLastName: "Durand",
    legalPhone: "0606060606",
    legalEmail: "dreyer.wil@gmail.com",
    legalRelation: "mère",
    legalRelationOther: "",
    legalAddressDifferent: false,
    legalAddress: "",
    legalCity: "",
    legalPostalCode: "",

    // Étape paiement & CGV
    paymentMethod: "CB",
    acceptedCGV: false,
    acceptedDocs: false, // Nouvelle case "Je m’engage à envoyer les documents"
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fermer la modal en cliquant sur l'overlay
  const handleOverlayClick = () => {
    setIsModalOpen(false);
  };

  // Empêche la fermeture en cliquant à l'intérieur
  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  // Gestion des champs
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === "checkbox" ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: fieldValue }));
  };

  // ============================= //
  // Validation par étape
  // ============================= //
  const validateStep1 = () => {
    const {
      minorFirstName,
      minorLastName,
      minorBirthDate,
      minorAddress,
      minorCity,
      minorPostalCode,
    } = formData;

    // Champs obligatoires pour Étape 1
    if (
      !minorFirstName ||
      !minorLastName ||
      !minorBirthDate ||
      !minorAddress ||
      !minorCity ||
      !minorPostalCode
    ) {
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const {
      legalFirstName,
      legalLastName,
      legalPhone,
      legalEmail,
      legalRelation,
      legalRelationOther,
      legalAddressDifferent,
      legalAddress,
      legalCity,
      legalPostalCode,
    } = formData;

    // Tous obligatoires
    if (
      !legalFirstName ||
      !legalLastName ||
      !legalPhone ||
      !legalEmail ||
      !legalRelation
    ) {
      return false;
    }

    // Si "autre", le champ "legalRelationOther" est obligatoire
    if (legalRelation === "autre" && !legalRelationOther) {
      return false;
    }

    // Si adresse différente, obligatoires aussi
    if (legalAddressDifferent) {
      if (!legalAddress || !legalCity || !legalPostalCode) {
        return false;
      }
    }

    return true;
  };

  const validateStep3 = () => {
    // acceptedCGV & acceptedDocs doivent être cochés
    if (!formData.acceptedCGV || !formData.acceptedDocs) {
      return false;
    }
    return true;
  };

  // Navigation entre étapes avec vérification
  const handleNextStep = () => {
    if (formStep === 1) {
      if (!validateStep1()) {
        alert("Veuillez remplir tous les champs obligatoires de l'étape 1.");
        return;
      }
      setFormStep(2);
    } else if (formStep === 2) {
      if (!validateStep2()) {
        alert("Veuillez remplir tous les champs obligatoires de l'étape 2.");
        return;
      }
      setFormStep(3);
    }
  };

  const handlePrevStep = () => {
    setFormStep((prev) => (prev > 1 ? prev - 1 : 1));
  };

  // Soumission finale
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Vérifie Étape 3 (cases cochées)
    if (!validateStep3()) {
      alert(
        "Vous devez accepter les CGV et vous engager à envoyer les documents demandés."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          selectedDate,
          selectedCity,
          selectedAgeGroup,
          reservationPrice,
        }),
      });

      if (response.ok) {
        setSubmitSuccess(true);
      } else {
        alert("Une erreur est survenue lors de l'envoi de votre réservation.");
      }
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de la connexion au serveur.");
    }
    setIsSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleOverlayClick}
    >
      {/* Conteneur central avec scroll si le contenu dépasse */}
      <div
        className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl relative max-h-[80vh] overflow-y-auto"
        onClick={handleContentClick}
      >
        {/* Bouton de fermeture (en haut à droite) */}
        <button
          className="absolute top-2 right-2 text-gray-600 hover:text-gray-800"
          onClick={() => setIsModalOpen(false)}
        >
          ✕
        </button>

        {submitSuccess ? (
          // Message de confirmation
          <div className="mt-8 text-center">
            <h2 className="text-2xl font-bold text-green-600 mb-4">
              Votre réservation a été envoyée avec succès !
            </h2>
            <button
              className="bg-gray-700 text-white px-4 py-2 rounded-md"
              onClick={() => setIsModalOpen(false)}
            >
              Fermer
            </button>
          </div>
        ) : (
          // Formulaire multi-étapes
          <form onSubmit={handleSubmit}>
            <div className="mb-6 text-center">
              <span className="font-semibold">Étape {formStep} / 3</span>
            </div>

            {/* ===================== ÉTAPE 1 : Récap + Mineur ===================== */}
            {formStep === 1 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">
                  Récapitulatif & Informations du mineur
                </h2>

                {/* Récap du séjour */}
                <div className="space-y-2 p-4 bg-gray-100 rounded-md">
                  <p>
                    <strong>Date sélectionnée :</strong> {selectedDate}
                  </p>
                  <p>
                    <strong>Ville de départ :</strong> {selectedCity}
                  </p>
                  <p>
                    <strong>Tranche d'âge :</strong> {selectedAgeGroup}
                  </p>
                  <p>
                    <strong>Prix total :</strong> {reservationPrice} €
                  </p>
                </div>

                {/* Formulaire : label à gauche, input à droite */}
                <div className="space-y-2">
                  {/* Prénom */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Prénom du mineur <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="minorFirstName"
                      value={formData.minorFirstName}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                      required
                    />
                  </div>

                  {/* Nom */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Nom du mineur <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="minorLastName"
                      value={formData.minorLastName}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                      required
                    />
                  </div>

                  {/* Sexe */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">Sexe</label>
                    <select
                      name="minorSex"
                      value={formData.minorSex}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                    >
                      <option value="Fille">Fille</option>
                      <option value="Garçon">Garçon</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  {/* Date de naissance */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Date de naissance <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="minorBirthDate"
                      value={formData.minorBirthDate}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                      required
                    />
                  </div>

                  {/* Lieu de naissance */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Lieu de naissance
                    </label>
                    <input
                      type="text"
                      name="minorBirthPlace"
                      value={formData.minorBirthPlace}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                    />
                  </div>

                  {/* Téléphone mineur (pas obligatoire) */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Téléphone du mineur
                    </label>
                    <input
                      type="tel"
                      name="minorPhone"
                      value={formData.minorPhone}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                    />
                  </div>

                  {/* Adresse mineur */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Adresse <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="minorAddress"
                      value={formData.minorAddress}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                      required
                    />
                  </div>

                  {/* Ville mineur */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Ville <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="minorCity"
                      value={formData.minorCity}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                      required
                    />
                  </div>

                  {/* Code postal mineur */}
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Code postal <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="minorPostalCode"
                      value={formData.minorPostalCode}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                      required
                    />
                  </div>

                  {/* Infos importantes (pas obligatoire) */}
                  <div className="flex items-start">
                    <label className="w-1/3 text-sm font-medium mt-2">
                      Informations importantes
                    </label>
                    <textarea
                      name="minorImportantInfo"
                      value={formData.minorImportantInfo}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ===================== ÉTAPE 2 : Responsable légal ===================== */}
            {formStep === 2 && (
              <div className="space-y-2">
                <h2 className="text-xl font-bold mb-4">
                  Informations sur le responsable légal
                </h2>

                {/* Prénom */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium">
                    Prénom <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="legalFirstName"
                    value={formData.legalFirstName}
                    onChange={handleChange}
                    className="w-2/3 border border-gray-300 rounded-md p-2"
                    required
                  />
                </div>

                {/* Nom */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium">
                    Nom <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="legalLastName"
                    value={formData.legalLastName}
                    onChange={handleChange}
                    className="w-2/3 border border-gray-300 rounded-md p-2"
                    required
                  />
                </div>

                {/* Téléphone */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium">
                    Téléphone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="legalPhone"
                    value={formData.legalPhone}
                    onChange={handleChange}
                    className="w-2/3 border border-gray-300 rounded-md p-2"
                    required
                  />
                </div>

                {/* Email */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="legalEmail"
                    value={formData.legalEmail}
                    onChange={handleChange}
                    className="w-2/3 border border-gray-300 rounded-md p-2"
                    required
                  />
                </div>

                {/* Relation */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium">Relation</label>
                  <select
                    name="legalRelation"
                    value={formData.legalRelation}
                    onChange={handleChange}
                    className="w-2/3 border border-gray-300 rounded-md p-2"
                  >
                    <option value="père">Père</option>
                    <option value="mère">Mère</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>

                {/* Si "autre", préciser */}
                {formData.legalRelation === "autre" && (
                  <div className="flex items-center">
                    <label className="w-1/3 text-sm font-medium">
                      Précisez <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="legalRelationOther"
                      value={formData.legalRelationOther}
                      onChange={handleChange}
                      className="w-2/3 border border-gray-300 rounded-md p-2"
                      placeholder="Tante, Oncle, etc."
                      required
                    />
                  </div>
                )}

                {/* Checkbox "Adresse différente" */}
                <div className="flex items-center mt-4">
                  <input
                    type="checkbox"
                    id="legalAddressDifferent"
                    name="legalAddressDifferent"
                    checked={formData.legalAddressDifferent}
                    onChange={handleChange}
                    className="h-4 w-4 mr-2"
                  />
                  <label htmlFor="legalAddressDifferent" className="text-sm">
                    Adresse différente de celle du mineur
                  </label>
                </div>

                {/* Si l'adresse est différente, afficher ces champs */}
                {formData.legalAddressDifferent && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center">
                      <label className="w-1/3 text-sm font-medium">
                        Adresse <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="legalAddress"
                        value={formData.legalAddress}
                        onChange={handleChange}
                        className="w-2/3 border border-gray-300 rounded-md p-2"
                        required
                      />
                    </div>
                    <div className="flex items-center">
                      <label className="w-1/3 text-sm font-medium">
                        Ville <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="legalCity"
                        value={formData.legalCity}
                        onChange={handleChange}
                        className="w-2/3 border border-gray-300 rounded-md p-2"
                        required
                      />
                    </div>
                    <div className="flex items-center">
                      <label className="w-1/3 text-sm font-medium">
                        Code postal <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="legalPostalCode"
                        value={formData.legalPostalCode}
                        onChange={handleChange}
                        className="w-2/3 border border-gray-300 rounded-md p-2"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===================== ÉTAPE 3 : Récap + Paiement ===================== */}
            {formStep === 3 && (
              <PaymentStep
                formData={formData}
                handleChange={handleChange}
                selectedDate={selectedDate}
                selectedCity={selectedCity}
                selectedAgeGroup={selectedAgeGroup}
                reservationPrice={reservationPrice}
                handlePrevStep={handlePrevStep}
              />
            )}

            {/* Boutons de navigation */}
            {!submitSuccess && (
              <div className="mt-6 flex justify-between">
                {formStep === 2 ? (
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
                  >
                    Précédent
                  </button>
                ) : (
                  <span></span>
                )}

                {formStep < 3 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                  >
                    Suivant
                  </button>
                ) : ("") }
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
