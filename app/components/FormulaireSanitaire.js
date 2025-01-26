import React, { useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';

export default function FormulaireSanitaire({ reservationData }) {
  // Initialisation des données dans le formulaire
  const [formData, setFormData] = useState({
    nomMineur: reservationData?.mineur?.lastName || '',
    prenomMineur: reservationData?.mineur?.firstName || '',
    dateNaissance: reservationData?.mineur?.birthDate || '',
    sexe: reservationData?.mineur?.sex || '',
    vaccinations: '',
    traitementMedical: '',
    allergies: '',
    responsable1Nom: reservationData?.responsable?.lastName || '',
    responsable1Prenom: reservationData?.responsable?.firstName || '',
    responsable1Tel: reservationData?.responsable?.phone || '',
    responsable2Nom: '',
    responsable2Prenom: '',
    responsable2Tel: '',
    medecin: '',
    signature: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Charger le PDF modèle (ton fichier CERFA téléchargé)
    const existingPdfBytes = await fetch('/path/to/cerfa-10008-02.pdf').then(res => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Récupérer la première page du PDF
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // Remplir les champs du formulaire avec les données
    const form = pdfDoc.getForm();
    form.getTextField('NOM DU MINEUR').setText(formData.nomMineur);
    form.getTextField('PRENOM').setText(formData.prenomMineur);
    form.getTextField('DATE DE NAISSANCE').setText(formData.dateNaissance);
    form.getRadioGroup('SEXE').select(formData.sexe); // M ou F
    form.getTextField('VACCINATIONS').setText(formData.vaccinations);
    form.getTextField('TRAITEMENT MEDICAL').setText(formData.traitementMedical);
    form.getTextField('ALLERGIES').setText(formData.allergies);
    form.getTextField('RESPONSABLE NOM').setText(formData.responsable1Nom);
    form.getTextField('RESPONSABLE PRENOM').setText(formData.responsable1Prenom);
    form.getTextField('RESPONSABLE TEL').setText(formData.responsable1Tel);
    form.getTextField('RESPONSABLE 2 NOM').setText(formData.responsable2Nom);
    form.getTextField('RESPONSABLE 2 PRENOM').setText(formData.responsable2Prenom);
    form.getTextField('RESPONSABLE 2 TEL').setText(formData.responsable2Tel);
    form.getTextField('MEDECIN').setText(formData.medecin);
    form.getTextField('SIGNATURE').setText(formData.signature);

    // Générer le PDF rempli
    const pdfBytes = await pdfDoc.save();

    // Télécharger le PDF
    saveAs(new Blob([pdfBytes]), 'fiche_sanitaire.pdf');
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow-md">
      <h1 className="text-2xl font-bold mb-6">Fiche Sanitaire de Liaison</h1>
      
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Informations du Mineur */}
          <div>
            <label className="block text-lg font-semibold">Nom du Mineur :</label>
            <input
              type="text"
              name="nomMineur"
              value={formData.nomMineur}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-lg font-semibold">Prénom du Mineur :</label>
            <input
              type="text"
              name="prenomMineur"
              value={formData.prenomMineur}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-lg font-semibold">Date de Naissance :</label>
              <input
                type="date"
                name="dateNaissance"
                value={formData.dateNaissance}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-lg font-semibold">Sexe :</label>
              <select
                name="sexe"
                value={formData.sexe}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </div>
          </div>

          {/* Vaccinations */}
          <div>
            <label className="block text-lg font-semibold">Vaccinations :</label>
            <textarea
              name="vaccinations"
              value={formData.vaccinations}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Allergies */}
          <div>
            <label className="block text-lg font-semibold">Allergies :</label>
            <input
              type="text"
              name="allergies"
              value={formData.allergies}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Responsable 1 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Responsable 1</h2>
            <div>
              <label className="block text-lg font-semibold">Nom :</label>
              <input
                type="text"
                name="responsable1Nom"
                value={formData.responsable1Nom}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-lg font-semibold">Prénom :</label>
              <input
                type="text"
                name="responsable1Prenom"
                value={formData.responsable1Prenom}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-lg font-semibold">Téléphone :</label>
              <input
                type="text"
                name="responsable1Tel"
                value={formData.responsable1Tel}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Responsable 2 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Responsable 2</h2>
            <div>
              <label className="block text-lg font-semibold">Nom :</label>
              <input
                type="text"
                name="responsable2Nom"
                value={formData.responsable2Nom}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-lg font-semibold">Prénom :</label>
              <input
                type="text"
                name="responsable2Prenom"
                value={formData.responsable2Prenom}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-lg font-semibold">Téléphone :</label>
              <input
                type="text"
                name="responsable2Tel"
                value={formData.responsable2Tel}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Médecin */}
          <div>
            <label className="block text-lg font-semibold">Médecin Traitant :</label>
            <input
              type="text"
              name="medecin"
              value={formData.medecin}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Signature */}
          <div>
            <label className="block text-lg font-semibold">Signature :</label>
            <input
              type="text"
              name="signature"
              value={formData.signature}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md mt-6">Générer le PDF</button>
        </div>
      </form>
    </div>
  );
}
