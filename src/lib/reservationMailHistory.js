import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/src/lib/serverFirebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { normalizeReservationStatus } from "@/src/lib/reservations";

export async function prepareReservationMail({ reservationId, requestId, actor, to, subject, html, template, attachments }) {
  if (!/^[\w-]{1,128}$/.test(reservationId || "") || !/^[\w-]{1,64}$/.test(requestId || "")) {
    throw Object.assign(new Error("Réservation ou identifiant d’envoi invalide."), { status: 400 });
  }
  if (Buffer.byteLength(html, "utf8") > 300000) {
    throw Object.assign(new Error("Le contenu de l’email est trop volumineux."), { status: 413 });
  }
  const db = adminDb();
  const reservation = db.collection(COLLECTIONS.RESERVATIONS).doc(reservationId);
  const entry = reservation.collection("activity").doc("email-" + requestId);
  return db.runTransaction(async (transaction) => {
    const [booking, previous] = await Promise.all([transaction.get(reservation), transaction.get(entry)]);
    if (!booking.exists) throw Object.assign(new Error("Réservation introuvable."), { status: 404 });
    if (previous.exists && previous.get("delivery") !== "failed") {
      const duplicateStatus = previous.get("delivery");
      return { duplicate: true, sent: duplicateStatus === "sent" };
    }

    const track = ["pending", "waitlist"].includes(normalizeReservationStatus(booking.get("status"))) && !booking.get("archived");
    transaction.set(entry, {
      type: "email",
      delivery: "sending",
      createdAt: FieldValue.serverTimestamp(),
      actorUid: actor.uid,
      actorEmail: actor.email,
      ...(track ? { actorName: actor.name, subject, recipient: to, template, html, attachments } : {}),
    });
    // Seuls les emails écrits par l'équipe comptent comme un contact avec la famille (suivi CRM).
    return { entry, reservation, countsAsContact: track && actor.uid !== "automation" };
  });
}

export async function sendReservationMail(operation, send, sendCopy) {
  if (operation?.duplicate) {
    return operation.sent
      ? Response.json({ success: true })
      : Response.json({ error: "Cet envoi a déjà été traité ou est en cours." }, { status: 409 });
  }
  let info;
  try {
    info = await send();
  } catch (error) {
    await operation?.entry?.update({ delivery: "failed" }).catch((logError) => console.error("Échec de journalisation", logError));
    throw error;
  }
  let warning;
  try {
    await operation?.entry?.update({ delivery: "sent", createdAt: FieldValue.serverTimestamp() });
  } catch (error) {
    console.error("Email envoyé, historique indisponible", error);
    warning = "Email envoyé. Historique indisponible.";
  }
  if (operation?.countsAsContact) {
    await operation.reservation.update({
      "crm.lastContactAt": FieldValue.serverTimestamp(),
      "crm.lastContactType": "email",
    }).catch((error) => console.error("Email envoyé, date de dernier contact non enregistrée", error));
  }
  try {
    await sendCopy();
  } catch (error) {
    console.error("Copie administrative indisponible", error);
    warning ||= "Email envoyé à la famille. La copie administrative a échoué.";
  }
  return Response.json({ success: true, messageId: info.messageId, ...(warning ? { warning } : {}) });
}
