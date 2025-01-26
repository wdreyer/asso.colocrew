import React, { useState } from 'react';

export default function DocumentsObligatoires() {
  const [documents, setDocuments] = useState([
    { name: "Carte d'identité", status: '', verified: false, link: '#', uploaded: false },
    { name: "Pass nautique", status: '', verified: false, link: '#', uploaded: false },
    { name: "Charte participant", status: 'à signer', verified: false, link: '#', uploaded: false },
    { name: "Fiche sanitaire", status: 'à remplir', verified: false, link: '/formulaire-sanitaire', uploaded: false },
    { name: "Assurance civil", status: '', verified: false, link: '#', uploaded: false },
    { name: "Attestation CMU/Carte vitale", status: '', verified: false, link: '#', uploaded: false },
    { name: "Autres documents", status: '', verified: false, link: '#', uploaded: false }
  ]);

  const handleChange = (index, type) => {
    const newDocuments = [...documents];
    if (type === 'status') {
      newDocuments[index].status = newDocuments[index].status === '' ? 'rempli' : '';
    } else if (type === 'verified') {
      newDocuments[index].verified = !newDocuments[index].verified;
    }
    setDocuments(newDocuments);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md mt-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Documents Obligatoires</h2>

      {/* Table des documents */}
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
            <tr key={index} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2">{doc.name}</td>
              <td className="px-4 py-2">
                <span
                  className={`px-2 py-1 rounded-full ${
                    doc.status === 'rempli' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'
                  }`}
                >
                  {doc.status === '' ? 'Non rempli' : 'Rempli'}
                </span>
              </td>
              <td className="px-4 py-2">
                <a
                  href={doc.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline mr-4"
                >
                  {doc.name === 'Fiche sanitaire' ? 'Remplir' : 'Télécharger'}
                </a>

                {/* Case à cocher "Document rempli" */}
                <input
                  type="checkbox"
                  checked={doc.status === 'rempli'}
                  onChange={() => handleChange(index, 'status')}
                  className="mr-2"
                />
                Document rempli

                {/* Case à cocher "Vérifié" */}
                <input
                  type="checkbox"
                  checked={doc.verified}
                  onChange={() => handleChange(index, 'verified')}
                  className="ml-4"
                />
                Vérifié
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Si la Fiche Sanitaire est remplie, on peut l'ajouter dans Firestore */}
      <div className="mt-6">
        <button
          onClick={() => {
            // Cette fonction peut être utilisée pour ajouter des données dans Firestore lorsque le document est généré.
            console.log('Fiche sanitaire remplie');
          }}
          className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 mt-2"
        >
          Ajouter la fiche sanitaire dans Firestore
        </button>
      </div>
    </div>
  );
}
