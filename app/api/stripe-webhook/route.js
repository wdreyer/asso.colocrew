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

// Si besoin, vous pouvez définir explicitement le runtime.
// Pour un environnement Node.js (par défaut), décommentez ou laissez tel quel :
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Gère les requêtes POST vers le webhook Stripe.
 */
export async function POST(request) {
  console.log("Requête reçue avec la méthode POST");

  // Récupérer le corps brut en tant qu'ArrayBuffer
  let buf;
  try {
    buf = await request.arrayBuffer();
  } catch (err) {
    console.error("Erreur lors de la lecture du buffer", err);
    return new Response("Erreur serveur", { status: 500 });
  }

  // Récupérer la signature dans les headers
  const sig = request.headers.get("stripe-signature");

  // Convertir l'ArrayBuffer en Buffer Node
  const payload = Buffer.from(buf);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload.toString(),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Traiter l'événement (seulement checkout.session.completed pour l'instant)
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    // Récupérer tokenUnique depuis les metadata
    const tokenUnique = session.metadata.tokenUnique;
    // Convertir le montant payé (centimes en euros) et arrondir à 2 décimales
    const amountPaid = Number((session.amount_total / 100).toFixed(2));

    try {
      // Rechercher dans Firestore le document dont le tokenUnique correspond
      const reservationsRef = collection(db, "reservations");
      const q = query(reservationsRef, where("tokenUnique", "==", tokenUnique));
      const snap = await getDocs(q);

      if (!snap.empty) {
        // Récupérer le premier document correspondant
        const reservationDoc = snap.docs[0];
        const reservationData = reservationDoc.data();
        const payment = reservationData.payment;
        const basePrice = Number(payment.basePrice); // On suppose que basePrice est déjà défini en euros

        // Récupérer le montant déjà payé (ou 0 s'il n'existe pas) et arrondir
        const alreadyPaid = Number(payment.alreadyPaid) || 0;
        // Additionner le paiement actuel au montant déjà payé et arrondir à 2 décimales
        const newAlreadyPaid = Number((alreadyPaid + amountPaid).toFixed(2));
        // Calculer le nouveau reste à payer et arrondir à 2 décimales
        const newRemainingValue = Number((basePrice - newAlreadyPaid).toFixed(2));

        // Déterminer le nouveau statut de paiement
        let newStatus;
        if (newRemainingValue <= 0) {
          newStatus = "paid";
        } else if (newAlreadyPaid > 0) {
          newStatus = "in_progress";
        } else {
          newStatus = "not_paid";
        }

        // Mettre à jour le document dans Firestore
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
      // Retourner un code 500 pour indiquer à Stripe de réessayer le webhook.
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
