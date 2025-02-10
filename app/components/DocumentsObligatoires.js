import React, { useState, useEffect } from 'react';

export default function DocumentsObligatoires({ initialDocuments }) {
  const [documents, setDocuments] = useState([]);

  // Transformation de l'objet initial en tableau
  useEffect(() => {
    if (initialDocuments) {
      const mapping = {
        ficheSanitaire: "Fiche sanitaire",
        traitementsOrdonnances: "Ensemble des traitements et des ordonnances",
        photocopieCarnetVaccination: "Photocopie du carnet de vaccination",
        conditionsVentes: "Conditions de ventes signée",
        charteParticipant: "Charte du participant signée",
        photocopieIdentite: "Photocopie R/V d’un document d’identité du jeune",
        passNautique: "Pass Nautique",
        attestationResponsabiliteCivile: "Attestation de responsabilité civile (le cas échéant)",
        attestationComplementaireSante: "Attestation de Complémentaire santé solidaire (ex-CMU-C) le cas échéant",
        ficheInscription: "Fiche d'inscription"
      };

      const docsArray = Object.entries(initialDocuments).map(([key, value]) => ({
        key,
        name: mapping[key] || key,
        uploaded: value.uploaded,
        url: value.url
      }));

      setDocuments(docsArray);
    }
  }, [initialDocuments]);

  // Par exemple, ici on permet de basculer l'état "uploaded"
  const handleChange = (index, type) => {
    const newDocuments = [...documents];
    if (type === 'uploaded') {
      newDocuments[index].uploaded = !newDocuments[index].uploaded;
    }
    setDocuments(newDocuments);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md mt-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Documents Obligatoires</h2>
      <table className="min-w-full table-auto">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Document</th>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Statut</th>
            <th className="px-4 py-2 text-left font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, index) => (
            <tr key={doc.key} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2">{doc.name}</td>
              <td className="px-4 py-2">
                <span
                  className={`px-2 py-1 rounded-full ${
                    doc.uploaded
                      ? 'bg-green-200 text-green-800'
                      : 'bg-yellow-200 text-yellow-800'
                  }`}
                >
                  {doc.uploaded ? 'Uploadé' : 'Non uploadé'}
                </span>
              </td>
              <td className="px-4 py-2">
                <a
                  href={doc.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline mr-4"
                >
                  {doc.url ? 'Voir' : 'Uploader'}
                </a>
                <input
                  type="checkbox"
                  checked={doc.uploaded}
                  onChange={() => handleChange(index, 'uploaded')}
                  className="mr-2"
                />
                Document uploadé
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6">
        <button
          onClick={() => {
            // Ici, vous pouvez ajouter une logique pour mettre à jour Firestore avec les nouvelles valeurs.
            console.log('Mise à jour des documents:', documents);
          }}
          className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 mt-2"
        >
          Mettre à jour les documents dans Firestore
        </button>
      </div>
    </div>
  );
}
