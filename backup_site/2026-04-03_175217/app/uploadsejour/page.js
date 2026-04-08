"use client";
import { useState } from "react";
import { db } from "@/app/firebase";
import { collection, doc, setDoc } from "firebase/firestore";

export default function UploadSejours() {
  const [file, setFile] = useState(null);
  const [jsonData, setJsonData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  // 🔹 Gérer la sélection du fichier JSON
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          setJsonData(json);
          setFile(file);
        } catch (error) {
          setMessage("Erreur: Le fichier JSON est invalide.");
          setJsonData(null);
          setFile(null);
        }
      };
      reader.readAsText(file);
    } else {
      setMessage("Veuillez sélectionner un fichier JSON valide.");
      setJsonData(null);
      setFile(null);
    }
  };

  // 🔹 Envoyer plusieurs séjours à Firestore
  const handleUpload = async () => {
    if (!jsonData) {
      setMessage("Aucune donnée à envoyer.");
      return;
    }

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const sejoursCollection = collection(db, "sejours");

      for (const sejourId in jsonData) {
        const sejourData = jsonData[sejourId];

        try {
          await setDoc(doc(sejoursCollection, sejourId), sejourData);
          successCount++;
        } catch (error) {
          console.error(`Erreur lors de l'ajout de ${sejourId} :`, error);
          errorCount++;
        }
      }

      setMessage(
        `${successCount} séjour(s) ajouté(s) avec succès. ${
          errorCount > 0 ? errorCount + " erreur(s) rencontrée(s)." : ""
        }`
      );

      setFile(null);
      setJsonData(null);
    } catch (error) {
      setMessage("Erreur lors de l'upload : " + error.message);
    }

    setUploading(false);
  };

  return (
    <div className="max-w-lg mx-auto p-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-xl font-semibold mb-4">Ajouter plusieurs séjours</h2>

      <input
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        className="block w-full p-2 border rounded mb-4"
      />

      {jsonData && (
        <div className="mb-4">
          <h3 className="text-lg font-medium">Aperçu des séjours :</h3>
          <pre className="p-2 bg-gray-100 border rounded text-sm overflow-x-auto">
            {JSON.stringify(jsonData, null, 2)}
          </pre>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={uploading || !jsonData}
        className={`w-full px-4 py-2 rounded text-white ${
          uploading || !jsonData ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
        }`}
      >
        {uploading ? "Envoi en cours..." : "Ajouter à Firebase"}
      </button>

      {message && <p className="mt-4 text-center text-sm text-red-600">{message}</p>}
    </div>
  );
}
