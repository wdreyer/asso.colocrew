"use client";
import { useSearchParams } from "next/navigation"; // Pour lire ?justCreated=true
import { useEffect, useState } from "react";
import { db } from "@/app/firebase"; // Chemin vers ton init Firestore
import { collection, query, where, getDocs } from "firebase/firestore";
import DocumentsObligatoires from "@/app/components/DocumentsObligatoires";

export default function ReservationPage({ params }) {
  const { token } = params; // Next.js 13 : param route
  const searchParams = useSearchParams(); // Récupère l'URL query
  const justCreated = searchParams.get("justCreated") === "true";

  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    async function fetchReservation() {
      setLoading(true);
      try {
        const q = query(
          collection(db, "campBooking"),
          where("tokenUnique", "==", token)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setReservation(snap.docs[0].data());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchReservation();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-52">
        <div className="w-12 h-12 border-4 border-t-transparent border-blue-500 border-solid rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!reservation) {
    return <p className="p-6 text-red-600">Aucune réservation trouvée pour ce token.</p>;
  }

  // Récupérer les valeurs de reservation de manière sécurisée avec l'opérateur de chaînage optionnel (?.)
  const {
    numeroDeReservation,
    createdAt,
    selectedDate,
    selectedCity,
    selectedAgeGroup,
    reservationPrice,
    mineur,
    responsable,
    acompte,
    resteAPayer
  } = reservation || {};

  // Créer un lien vers le formulaire sanitaire pré-rempli avec les données
  const formUrl = `/formulaire-sanitaire?nom=${encodeURIComponent(mineur?.lastName)}&prenom=${encodeURIComponent(mineur?.firstName)}&dateNaissance=${encodeURIComponent(mineur?.birthDate)}&sexe=${encodeURIComponent(mineur?.sex)}&email=${encodeURIComponent(responsable?.email)}&tel=${encodeURIComponent(responsable?.phone)}`;

  return (
    <div className="max-w-3xl mx-auto bg-white p-6 mt-6 rounded shadow-md">
      {justCreated && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          <p className="font-bold">Votre réservation a bien été enregistrée !</p>
          <p>Vous allez recevoir une confirmation par mail.</p>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-4">Détails de la réservation</h1>

      <div className="mb-4 text-sm text-gray-700">
        <p>
          <strong>Numéro de réservation :</strong> {numeroDeReservation || "N/A"}
        </p>
        <p>
          <strong>Date de création :</strong> {createdAt || "inconnue"}
        </p>
        <p>
          <strong>Date de séjour :</strong> {selectedDate || "N/A"}
        </p>
        <p>
          <strong>Ville de départ :</strong> {selectedCity || "N/A"}
        </p>
        <p>
          <strong>Tranche d'âge :</strong> {selectedAgeGroup || "N/A"}
        </p>
        <p>
          <strong>Prix total à payer :</strong> {reservationPrice || "N/A"} €
        </p>
      </div>

      {/* Présentation en colonnes */}
      <div className="grid grid-cols-2 gap-6 text-sm">
        {/* Colonne 1: Mineur */}
        <div className="bg-gray-50 p-4 rounded-md shadow-sm space-y-2">
          <h2 className="font-semibold text-lg text-gray-800">Informations du mineur</h2>
          {mineur ? (
            <>
              <p><strong>Nom :</strong> {mineur.lastName}</p>
              <p><strong>Prénom :</strong> {mineur.firstName}</p>
              <p><strong>Date de naissance :</strong> {mineur.birthDate || "N/A"}</p>
              <p><strong>Sexe :</strong> {mineur.sex || "N/A"}</p>
              <p><strong>Adresse :</strong> {mineur.address}, {mineur.city} {mineur.postalCode}</p>
              {mineur.phone && <p><strong>Téléphone :</strong> {mineur.phone}</p>}
              {mineur.importantInfo && <p><strong>Infos importantes :</strong> {mineur.importantInfo}</p>}
            </>
          ) : (
            <p>Aucune info mineur.</p>
          )}
        </div>

        {/* Colonne 2: Responsable */}
        <div className="bg-gray-50 p-4 rounded-md shadow-sm space-y-2">
          <h2 className="font-semibold text-lg text-gray-800">Responsable légal</h2>
          {responsable ? (
            <>
              <p><strong>Nom :</strong> {responsable.lastName}</p>
              <p><strong>Prénom :</strong> {responsable.firstName}</p>
              <p><strong>Téléphone :</strong> {responsable.phone}</p>
              <p><strong>Email :</strong> {responsable.email}</p>
              <p><strong>Relation :</strong> {responsable.relationOther || responsable.relation}</p>
              {responsable.addressDifferent && (
                <p><strong>Adresse différente :</strong> {responsable.address}, {responsable.city} {responsable.postalCode}</p>
              )}
            </>
          ) : (
            <p>Aucune info responsable.</p>
          )}
        </div>

        {/* Colonne 3: Autres infos financières */}
        <div className="bg-gray-50 p-4 rounded-md shadow-sm space-y-2">
          <h2 className="font-semibold text-lg text-gray-800">Informations financières</h2>
          <p><strong>Acompte :</strong> {acompte ?? "N/A"} €</p>
          <p><strong>Reste à payer : </strong> {resteAPayer ?? "N/A"} €</p>
        </div>
      </div>

      {/* Section Documents obligatoires */}
      <div className="bg-gray-50 p-4 rounded-md shadow-sm mt-6">
        <h2 className="font-semibold text-lg text-gray-800">Documents obligatoires</h2>
        <DocumentsObligatoires/>
    
      </div>

      {/* Passer les données à FormulaireSanitaire */}
    </div>
  );
}
