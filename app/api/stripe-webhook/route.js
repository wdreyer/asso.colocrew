// app/api/stripe-webhook/route.js

import Stripe from "stripe";
import { db } from "@/app/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";

// On précise le runtime nodejs pour être sûr que l'environnement est compatible
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Gère les requêtes POST vers le webhook Stripe.
 */
export async function POST(request) {
  console.log("Requête reçue avec la méthode POST");

  // Récupérer le corps brut sous forme d'ArrayBuffer
  let buf;
  try {
    buf = await request.arrayBuffer();
  } catch (err) {
    console.error("Erreur lors de la lecture du buffer", err);
    return new Response("Erreur serveur", { status: 500 });
  }

  // Récupérer la signature depuis les headers
  const sig = request.headers.get("stripe-signature");

  // Convertir l'ArrayBuffer en Buffer Node (sans le transformer en string)
  const payload = Buffer.from(buf);

  let event;
  try {
    // Passer le Buffer brut directement pour conserver le format exact
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Traiter l'événement "checkout.session.completed"
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    // Récupérer tokenUnique depuis les metadata
    const tokenUnique = session.metadata.tokenUnique;
    // Convertir le montant payé (en centimes) en euros et arrondir à 2 décimales
    const amountPaid = Number((session.amount_total / 100).toFixed(2));

    try {
      // Rechercher dans Firestore la réservation correspondant au tokenUnique
      const reservationsRef = collection(db, "reservations");
      const q = query(reservationsRef, where("tokenUnique", "==", tokenUnique));
      const snap = await getDocs(q);

      if (!snap.empty) {
        // Récupérer le premier document correspondant
        const reservationDoc = snap.docs[0];
        const reservationData = reservationDoc.data();
        const payment = reservationData.payment;
        const basePrice = Number(payment.basePrice); // basePrice en euros

        // Calculer le montant déjà payé et le nouveau montant total payé
        const alreadyPaid = Number(payment.alreadyPaid) || 0;
        const newAlreadyPaid = Number((alreadyPaid + amountPaid).toFixed(2));
        // Calculer le nouveau reste à payer
        const newRemainingValue = Number((basePrice - newAlreadyPaid).toFixed(2));

        // Déterminer le nouveau statut du paiement
        let newStatus;
        if (newRemainingValue <= 0) {
          newStatus = "paid";
        } else if (newAlreadyPaid > 0) {
          newStatus = "in_progress";
        } else {
          newStatus = "not_paid";
        }

        // Mettre à jour la réservation dans Firestore
        const reservationRef = doc(db, "reservations", reservationDoc.id);
        await updateDoc(reservationRef, {
          "payment.paymentStatus": newStatus,
          "payment.alreadyPaid": newAlreadyPaid,
          "payment.remainingValue": newRemainingValue,
        });
        console.log(
          `Réservation ${tokenUnique} mise à jour : statut=${newStatus}, déjà payé=${newAlreadyPaid} €, reste à payer=${newRemainingValue} €`
        );
      } else {
        console.error(`Aucune réservation trouvée pour tokenUnique: ${tokenUnique}`);
      }
    } catch (err) {
      console.error("Erreur lors de la mise à jour de la réservation :", err);
      // Retourner une erreur 500 pour que Stripe réessaie ultérieurement
      return new Response("Erreur lors de la mise à jour de la réservation", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Méthode GET optionnelle pour retourner 405 si une autre méthode HTTP est utilisée.
 */
export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
