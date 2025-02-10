"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function PaiementPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  // Vous pouvez également récupérer d'autres paramètres si nécessaire, par exemple le montant restant
  // const montantRestant = searchParams.get("montantRestant");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("Token manquant");
      setLoading(false);
      return;
    }

    async function initPayment() {
      try {
        // Préparez les données à envoyer à votre API de paiement
        const payload = {
          tokenUnique: token,
          // Vous pouvez ajouter ici d'autres informations comme le montant restant
          // montantRestant: montantRestant,
          // Autres données si nécessaire...
          // Par exemple, si vous voulez forcer le paiement du reste :
          paymentOption: "rest",
        };

        const response = await fetch("/api/create-stripe-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
        if (!response.ok) {
          throw new Error("Erreur lors de la création de la session de paiement");
        }

        const data = await response.json();
        if (data.url) {
          // Redirigez l'utilisateur vers la page de paiement Stripe
          window.location.href = data.url;
        } else {
          throw new Error("URL de paiement introuvable");
        }
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    initPayment();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>Initialisation du paiement en cours...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-600">Erreur : {error}</p>
      </div>
    );
  }

  return null;
}
