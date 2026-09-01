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
  arrayUnion,
} from "firebase/firestore";
import { syncInstallmentSubscriptionCancellation } from "@/src/lib/stripeInstallments";

// On force l'exécution en runtime Node.js
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function toMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function amountFromStripeCents(value) {
  return toMoney(Number(value || 0) / 100);
}

function knownReservationTotal(payment = {}) {
  return Number(
    payment.resteACharge ??
    payment.validatedPrice ??
    payment.totalPrice ??
    payment.basePrice ??
    0,
  );
}

function hasProcessedStripePayment(payment = {}, { eventId, invoiceId, paymentIntentId } = {}) {
  const eventIds = Array.isArray(payment.stripePaymentEventIds) ? payment.stripePaymentEventIds : [];
  const invoiceIds = Array.isArray(payment.stripeInvoiceIds) ? payment.stripeInvoiceIds : [];
  const paymentIntentIds = Array.isArray(payment.stripePaymentIntentIds) ? payment.stripePaymentIntentIds : [];
  return Boolean(
    (eventId && eventIds.includes(eventId)) ||
    (invoiceId && invoiceIds.includes(invoiceId)) ||
    (paymentIntentId && paymentIntentIds.includes(paymentIntentId))
  );
}

function buildReservationPaymentPatch(reservationData, amountPaid, extra = {}) {
  const payment = reservationData.payment || {};
  const alreadyPaid = Number(payment.alreadyPaid || 0);
  const newAlreadyPaid = toMoney(alreadyPaid + amountPaid);
  const knownTotalDue = knownReservationTotal(payment);
  const newRemainingValue = knownTotalDue > 0
    ? toMoney(Math.max(knownTotalDue - newAlreadyPaid, 0))
    : payment.remainingValue ?? null;
  const newStatus = newRemainingValue === 0 ? "paid" : newAlreadyPaid > 0 ? "in_progress" : "not_paid";
  const finance = reservationData.finance || null;
  const currentFinancePaid = Number(finance?.paidAmount || 0);
  const nextFinancePaid = toMoney(currentFinancePaid + amountPaid);
  const financeNetAmount = Number(finance?.netAmount || 0);
  const financePatch = finance
    ? {
        "finance.paidAmount": nextFinancePaid,
        "finance.remainingAmount": toMoney(Math.max(financeNetAmount - nextFinancePaid, 0)),
        financeUpdatedAt: serverTimestamp(),
      }
    : {};

  return {
    "payment.paymentStatus": newStatus,
    "payment.alreadyPaid": newAlreadyPaid,
    "payment.remainingValue": newRemainingValue,
    "payment.lastStripePaymentAt": serverTimestamp(),
    "payment.lastStripePaymentAmount": amountPaid,
    updatedAt: serverTimestamp(),
    ...extra,
    ...financePatch,
  };
}

function stripeTrackingPatch({ eventId, invoiceId, paymentIntentId }) {
  const patch = {};
  if (eventId) patch["payment.stripePaymentEventIds"] = arrayUnion(eventId);
  if (invoiceId) patch["payment.stripeInvoiceIds"] = arrayUnion(invoiceId);
  if (paymentIntentId) patch["payment.stripePaymentIntentIds"] = arrayUnion(paymentIntentId);
  return patch;
}

async function findReservationByTokenOrSubscription({ tokenUnique, subscriptionId }) {
  const reservationsRef = collection(db, "reservations");
  if (tokenUnique) {
    const snap = await getDocs(query(reservationsRef, where("tokenUnique", "==", tokenUnique)));
    if (!snap.empty) return snap.docs[0];
  }
  if (subscriptionId) {
    const snap = await getDocs(query(reservationsRef, where("payment.installmentsSubscriptionId", "==", subscriptionId)));
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

async function creditReservationStripePayment({ tokenUnique, subscriptionId, amountPaid, eventId, invoiceId, paymentIntentId, source, billingReason }) {
  if (!amountPaid || amountPaid <= 0) return { status: "skipped", reason: "amount_zero" };
  const reservationDoc = await findReservationByTokenOrSubscription({ tokenUnique, subscriptionId });
  if (!reservationDoc) return { status: "missing_reservation" };

  const reservationData = reservationDoc.data();
  const payment = reservationData.payment || {};
  if (hasProcessedStripePayment(payment, { eventId, invoiceId, paymentIntentId })) {
    return { status: "already_processed", reservationId: reservationDoc.id };
  }
  if (
    source === "invoice.paid" &&
    billingReason === "subscription_create" &&
    payment.installmentsSubscriptionId === subscriptionId &&
    payment.lastStripePaymentSource === "checkout.session.completed" &&
    Math.abs(Number(payment.lastStripePaymentAmount || 0) - amountPaid) < 0.01
  ) {
    await updateDoc(doc(db, "reservations", reservationDoc.id), {
      ...stripeTrackingPatch({ eventId, invoiceId, paymentIntentId }),
      updatedAt: serverTimestamp(),
    });
    return { status: "already_credited_by_checkout", reservationId: reservationDoc.id };
  }

  const reservationRef = doc(db, "reservations", reservationDoc.id);
  await updateDoc(reservationRef, buildReservationPaymentPatch(reservationData, amountPaid, {
    ...(subscriptionId
      ? {
          "payment.installmentsSubscriptionId": subscriptionId,
          "payment.installmentsSubscriptionStatus": "active",
        }
      : {}),
    "payment.lastStripePaymentSource": source || null,
    ...stripeTrackingPatch({ eventId, invoiceId, paymentIntentId }),
  }));
  return { status: "credited", reservationId: reservationDoc.id };
}

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
    const subscriptionId = typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id || null;
    if (subscriptionId) {
      try {
        const sync = await syncInstallmentSubscriptionCancellation(stripe, subscriptionId);
        console.log("[stripe-webhook] sync abonnement echeances:", sync);
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const tokenUnique =
          invoice.subscription_details?.metadata?.tokenUnique ||
          subscription.metadata?.tokenUnique ||
          null;
        const paymentIntentId = typeof invoice.payment_intent === "string"
          ? invoice.payment_intent
          : invoice.payment_intent?.id || null;
        const amountPaid = amountFromStripeCents(invoice.amount_paid);
        const credit = await creditReservationStripePayment({
          tokenUnique,
          subscriptionId,
          amountPaid,
          eventId: event.id,
          invoiceId: invoice.id,
          paymentIntentId,
          source: "invoice.paid",
          billingReason: invoice.billing_reason || null,
        });
        console.log("[stripe-webhook] credit facture abonnement:", credit);
      } catch (err) {
        console.error("[stripe-webhook] erreur traitement facture abonnement:", err);
        return new Response("Erreur traitement facture abonnement", { status: 500 });
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
    const tokenUnique = session.metadata?.tokenUnique;
    const paymentType = session.metadata?.paymentType; // "deposit" ou undefined
    const amountPaid = amountFromStripeCents(session.amount_total);
    const sessionInvoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id || null;
    const sessionPaymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

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
        if (hasProcessedStripePayment(reservationData.payment, {
          eventId: event.id,
          invoiceId: sessionInvoiceId,
          paymentIntentId: sessionPaymentIntentId,
        })) {
          console.log(`[stripe-webhook] checkout deja traite pour ${tokenUnique}`);
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
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
            "payment.lastStripePaymentAt": serverTimestamp(),
            "payment.lastStripePaymentAmount": amountPaid,
            "payment.lastStripePaymentSource": "checkout.session.completed",
            ...stripeTrackingPatch({
              eventId: event.id,
              invoiceId: sessionInvoiceId,
              paymentIntentId: sessionPaymentIntentId,
            }),
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
            "payment.lastStripePaymentAt": serverTimestamp(),
            "payment.lastStripePaymentAmount": amountPaid,
            "payment.lastStripePaymentSource": "checkout.session.completed",
            ...stripeTrackingPatch({
              eventId: event.id,
              invoiceId: sessionInvoiceId,
              paymentIntentId: sessionPaymentIntentId,
            }),
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
            "payment.lastStripePaymentAt": serverTimestamp(),
            "payment.lastStripePaymentAmount": amountPaid,
            "payment.lastStripePaymentSource": "checkout.session.completed",
            ...stripeTrackingPatch({
              eventId: event.id,
              invoiceId: sessionInvoiceId,
              paymentIntentId: sessionPaymentIntentId,
            }),
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
