// components/ApplicationModal.js
"use client";
import { useState } from "react";

export default function ApplicationModal({ setIsModalOpen }) {
  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    email: "",
    telephone: "",
    message: "",
    formType: "candidature", // Indique le type de formulaire
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Envoi des données au backend en JSON
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitSuccess(true);
      } else {
        alert("Une erreur est survenue lors de l'envoi de votre candidature.");
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi du formulaire:", error);
      alert("Erreur lors de l'envoi de la candidature.");
    }

    setIsSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black bg-opacity-50"
      onClick={() => setIsModalOpen(false)}
    >
      <div
        className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative"
        onClick={(e) => e.stopPropagation()} // Empêche la propagation du clic à l'overlay
      >
        <button
          className="absolute top-2 right-2 text-gray-600 hover:text-gray-800"
          onClick={() => setIsModalOpen(false)}
        >
          ✕
        </button>
        <h2 className="text-2xl font-bold mb-4">Postuler</h2>

        {submitSuccess ? (
          <div>
            <p className="text-green-600 font-semibold">
              Votre candidature a été envoyée avec succès !
            </p>
            <button
              className="mt-4 bg-gray-700 text-white px-4 py-2 rounded-md"
              onClick={() => setIsModalOpen(false)}
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Champs du formulaire */}
            <div className="mb-4">
              <label htmlFor="nom" className="block text-gray-700">
                Nom :
              </label>
              <input
                type="text"
                id="nom"
                name="nom"
                value={formData.nom}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md p-2"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="prenom" className="block text-gray-700">
                Prénom :
              </label>
              <input
                type="text"
                id="prenom"
                name="prenom"
                value={formData.prenom}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md p-2"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="email" className="block text-gray-700">
                Email :
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md p-2"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="telephone" className="block text-gray-700">
                Téléphone :
              </label>
              <input
                type="tel"
                id="telephone"
                name="telephone"
                value={formData.telephone}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md p-2"
                required
              />
            </div>

            <div className="mb-4">
              <label htmlFor="message" className="block text-gray-700">
                Message de motivation :
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md p-2"
                rows="4"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition duration-300"
            >
              {isSubmitting ? "Envoi en cours..." : "Envoyer ma candidature"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
