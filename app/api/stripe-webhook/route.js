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
  serverTimestamp,
} from "firebase/firestore";
import { syncInstallmentSubscriptionCancellation } from "@/src/lib/stripeInstallments";

// On force l'exécution en runtime Node.js
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  console.log("Requête webhook reçue (POST)");

  // Récupérer le corps brut en tant qu'ArrayBuffer
  let buf;
  try {
    buf = await request.arrayBuffer();
  } catch (err) {
    console.error("Erreur lors de la lecture du body en arrayBuffer:", err);
    return new Response("Erreur serveur", { status: 500 });
  }

  // Récupérer la signature dans les headers
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    console.error("Header 'stripe-signature' manquant");
    return new Response("Signature manquante", { status: 400 });
  }

  // Convertir l'ArrayBuffer en Buffer Node sans le transformer en string
  const payload = Buffer.from(buf);

  let event;
  try {
    // IMPORTANT : Passer le Buffer brut directement à constructEvent
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription || null;
    if (subscriptionId) {
      try {
        const sync = await syncInstallmentSubscriptionCancellation(stripe, subscriptionId);
        console.log("[stripe-webhook] sync abonnement echeances:", sync);
      } catch (err) {
        console.error("[stripe-webhook] erreur sync abonnement echeances:", err);
        return new Response("Erreur sync abonnement", { status: 500 });
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    try {
      const reservationsRef = collection(db, "reservations");
      const q = query(reservationsRef, where("payment.installmentsSubscriptionId", "==", subscription.id));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((reservationDoc) => updateDoc(doc(db, "reservations", reservationDoc.id), {
        "payment.installmentsSubscriptionStatus": "canceled",
        "payment.installmentsCanceledAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      })));
      console.log(`[stripe-webhook] abonnement annule: ${subscription.id}, reservations=${snap.docs.length}`);
    } catch (err) {
      console.error("[stripe-webhook] erreur maj annulation abonnement:", err);
      return new Response("Erreur maj annulation abonnement", { status: 500 });
    }
  }

  // Traiter l'événement checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const tokenUnique = session.metadata.tokenUnique;
    const paymentType = session.metadata.paymentType; // "deposit" ou undefined
    const amountPaid = Number((session.amount_total / 100).toFixed(2));

    try {
      if (session.metadata?.campaign === "acompte-18-juin" && session.metadata?.acompteDocId) {
        await updateDoc(doc(db, "acompte_18_juin", session.metadata.acompteDocId), {
          status: "deposit_paid",
          paidAmount: amountPaid,
          stripePaymentIntent: session.payment_intent || "",
          paidAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const reservationsRef = collection(db, "reservations");
      const q = query(reservationsRef, where("tokenUnique", "==", tokenUnique));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const reservationDoc = snap.docs[0];
        const reservationData = reservationDoc.data();
        const reservationRef = doc(db, "reservations", reservationDoc.id);
        const finance = reservationData.finance || null;
        const currentFinancePaid = Number(finance?.paidAmount || 0);
        const nextFinancePaid = Number((currentFinancePaid + amountPaid).toFixed(2));
        const financeNetAmount = Number(finance?.netAmount || 0);
        const financePatch = finance
          ? {
              "finance.paidAmount": nextFinancePaid,
              "finance.remainingAmount": Number(
                Math.max(financeNetAmount - nextFinancePaid, 0).toFixed(2),
              ),
              financeUpdatedAt: serverTimestamp(),
            }
          : {};

        if (paymentType === "deposit") {
          // ── Paiement d'acompte ──────────────────────────────────────────
          const depositAmount = Number(reservationData.payment?.depositAmount || 100);
          const alreadyPaid = Number(reservationData.payment?.alreadyPaid || 0);
          const newAlreadyPaid = Number((alreadyPaid + amountPaid).toFixed(2));
          const confirmationAlreadySent = Boolean(reservationData.payment?.depositConfirmationSentAt);
          // Le prix n'est pas toujours connu au moment de l'acompte : on ne recalcule
          // le reste à payer que si un montant total (resteACharge ou prix validé) existe déjà.
          const knownTotalDue = Number(
            reservationData.payment?.resteACharge ??
            reservationData.payment?.validatedPrice ??
            reservationData.payment?.totalPrice ?? 0,
          );
          const newRemainingValue = knownTotalDue > 0
            ? Number(Math.max(knownTotalDue - newAlreadyPaid, 0).toFixed(2))
            : reservationData.payment?.remainingValue ?? null;
          await updateDoc(reservationRef, {
            "payment.depositStatus": "paid",
            "payment.alreadyPaid": newAlreadyPaid,
            "payment.depositAmount": depositAmount,
            "payment.remainingValue": newRemainingValue,
            status: "deposit_paid",
            updatedAt: serverTimestamp(),
            ...financePatch,
          });
          console.log(`Acompte reçu pour ${tokenUnique} : ${amountPaid}€`);

          // Envoi des emails de confirmation
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const lienAcces = `${baseUrl}/reservation/${tokenUnique}`;
          const { legal = {}, sejour = {}, numeroDeReservation } = reservationData;

          if (!confirmationAlreadySent) {
            const mailRes = await fetch(`${baseUrl}/api/mail-acompte`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                numeroDeReservation,
                lienAcces,
                clientEmail: legal.email,
                clientFirstName: legal.firstName,
                clientLastName: legal.lastName,
                sejourName: sejour.name || sejour.urlSejour || "",
                startDate: sejour.startDate,
                endDate: sejour.endDate,
                ageGroup: sejour.ageGroup,
                amountPaid,
              }),
            });

            if (!mailRes.ok) {
              throw new Error(`Erreur envoi mail-acompte: ${await mailRes.text()}`);
            }

            await updateDoc(reservationRef, {
              "payment.depositConfirmationSentAt": serverTimestamp(),
            });
          }

        } else if (paymentType === "installments") {
          // ── Paiement en plusieurs fois (abonnement Stripe) ──────────────
          const installmentsCount = Number(session.metadata.installments) || 0;
          if (session.subscription && installmentsCount > 1) {
            await stripe.subscriptions.update(session.subscription, {
              metadata: {
                tokenUnique,
                paymentType: "installments",
                installments: String(installmentsCount),
              },
            });
            const sync = await syncInstallmentSubscriptionCancellation(stripe, session.subscription);
            console.log("[stripe-webhook] abonnement echeances initialise:", sync);
          }

          const payment = reservationData.payment;
          const alreadyPaid = Number(payment?.alreadyPaid) || 0;
          const newAlreadyPaid = Number((alreadyPaid + amountPaid).toFixed(2));
          const knownTotalDue = Number(
            payment?.resteACharge ?? payment?.validatedPrice ?? payment?.totalPrice ?? 0,
          );
          const newRemainingValue = knownTotalDue > 0
            ? Number(Math.max(knownTotalDue - newAlreadyPaid, 0).toFixed(2))
            : payment?.remainingValue ?? null;
          const newStatus = newRemainingValue === 0 ? "paid" : "in_progress";

          await updateDoc(reservationRef, {
            "payment.paymentStatus": newStatus,
            "payment.alreadyPaid": newAlreadyPaid,
            "payment.remainingValue": newRemainingValue,
            "payment.installmentsSubscriptionId": session.subscription || null,
            "payment.installmentsSubscriptionStatus": session.subscription ? "active" : null,
            updatedAt: serverTimestamp(),
            ...financePatch,
          });
          console.log(`Abonnement (${installmentsCount}x) confirmé pour ${tokenUnique} : ${amountPaid}€ prélevés`);

        } else {
          // ── Paiement normal (solde ou paiement complet) ─────────────────
          const payment = reservationData.payment;
          const basePrice = Number(payment.validatedPrice || payment.totalPrice || payment.basePrice);
          const alreadyPaid = Number(payment.alreadyPaid) || 0;
          const newAlreadyPaid = Number((alreadyPaid + amountPaid).toFixed(2));
          const newRemainingValue = Number((basePrice - newAlreadyPaid).toFixed(2));

          let newStatus;
          if (newRemainingValue <= 0) {
            newStatus = "paid";
          } else if (newAlreadyPaid > 0) {
            newStatus = "in_progress";
          } else {
            newStatus = "not_paid";
          }

          await updateDoc(reservationRef, {
            "payment.paymentStatus": newStatus,
            "payment.alreadyPaid": newAlreadyPaid,
            "payment.remainingValue": newRemainingValue,
            updatedAt: serverTimestamp(),
            ...financePatch,
          });
          console.log(
            `Réservation ${tokenUnique} mise à jour : statut=${newStatus}, déjà payé=${newAlreadyPaid} €, reste=${newRemainingValue} €`
          );
        }
      } else {
        console.error(`Aucune réservation trouvée pour tokenUnique: ${tokenUnique}`);
      }
    } catch (err) {
      console.error("Erreur lors de la mise à jour de la réservation :", err);
      return new Response("Erreur lors de la mise à jour de la réservation", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
