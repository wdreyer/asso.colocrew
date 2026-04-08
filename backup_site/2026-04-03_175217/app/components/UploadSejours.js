"use client";
import { useSearchParams } from "next/navigation"; // Pour lire ?justCreated=true
import { useEffect, useState } from "react";
import { db } from "@/app/firebase"; // Chemin vers ton init Firestore
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";

export default function UploadSejours() {
  // Exemple d'utilisation de useSearchParams (facultatif)
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("justCreated") === "true";

  // État pour stocker le fichier JSON sélectionné
  const [file, setFile] = useState(null);

  // Quand un fichier est sélectionné, on le stocke dans le state
  const handleFileChange = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  // Fonction qui lit le fichier JSON et upload les données dans la collection "sejours"
  const handleUpload = async () => {
    if (!file) {
      alert("Veuillez sélectionner un fichier JSON.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // On parse le contenu du fichier JSON
        const jsonData = JSON.parse(event.target.result);
        // Pour chaque clé dans l'objet JSON, on enregistre un document dans la collection "sejours"
        for (const key in jsonData) {
          if (Object.prototype.hasOwnProperty.call(jsonData, key)) {
            await setDoc(doc(db, "sejours", key), jsonData[key]);
          }
        }
        alert("Données uploadées avec succès !");
      } catch (error) {
        console.error("Erreur lors de l'upload du fichier JSON :", error);
        alert("Erreur lors de l'upload des données.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Upload JSON Data to Firestore</h1>
      {justCreated && <p className="mb-2 text-green-600">Nouveau séjour créé.</p>}
      <input type="file" accept=".json" onChange={handleFileChange} />
      <button
        onClick={handleUpload}
        className="ml-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Upload JSON
      </button>
      {/* Inclusion d'un composant supplémentaire si nécessaire */}
    </div>
  );
}
