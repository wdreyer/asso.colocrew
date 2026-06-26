import nodemailer from "nodemailer";
import { initializeApp, getApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

export const runtime = "nodejs";

const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || "",
};

const db = getFirestore(getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG));

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatParisDate(date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysIso(isoDate, days) {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days, 12));
  return date.toISOString().slice(0, 10);
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }
  if (typeof value.toDate === "function") return formatParisDate(value.toDate());
  if (value instanceof Date) return formatParisDate(value);
  return "";
}

function childNames(reservation) {
  const children = Array.isArray(reservation?.minor?.children)
    ? reservation.minor.children
    : Array.isArray(reservation?.children)
      ? reservation.children
      : [];

  const names = children
    .map((child) => `${child.firstName || child.prenom || ""} ${child.lastName || child.nom || ""}`.trim())
    .filter(Boolean);

  if (names.length) return names.join(", ");
  return reservation?.childName || "votre enfant";
}

function childFirstNames(reservation) {
  const children = Array.isArray(reservation?.minor?.children)
    ? reservation.minor.children
    : Array.isArray(reservation?.children)
      ? reservation.children
      : [];

  const names = children.map((child) => child.firstName || child.prenom || "").filter(Boolean);
  return names.length ? names.join(", ") : childNames(reservation);
}

function reservationEmail(reservation) {
  return reservation?.legal?.email || reservation?.email || "";
}

function reservationStartDate(reservation) {
  return normalizeDateValue(reservation?.sejour?.startDate || reservation?.sejourStartDate || reservation?.startDate);
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function reminderHtml(reservation) {
  const parentFirstName = reservation?.legal?.firstName || reservation?.legal?.prenom || "";
  const children = childFirstNames(reservation);
  const fullChildren = childNames(reservation);
  const sejourName = reservation?.sejour?.name || reservation?.sejourName || "le séjour ColoCrew";
  const startDate = reservationStartDate(reservation);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#111827;line-height:1.6;">
      <p>Bonjour ${escapeHtml(parentFirstName)},</p>

      <p>
        Petit rappel à J-7 : le départ approche pour <strong>${escapeHtml(children)}</strong>
        dans le cadre de <strong>${escapeHtml(sejourName)}</strong>${startDate ? `, prévu le <strong>${escapeHtml(startDate)}</strong>` : ""}.
      </p>

      <p>
        La convocation de transport vous a déjà été envoyée. Merci de bien la conserver et de vérifier les horaires,
        le point de rendez-vous et les informations de retour.
      </p>

      <p><strong>Documents à vérifier avant le départ :</strong></p>
      <ul>
        <li>vaccins / carnet de santé ;</li>
        <li>carte d'identité ;</li>
        <li>test nautique.</li>
      </ul>

      <p>
        Ce rappel est générique : tous les documents ne concernent pas forcément tous les enfants.
        Si un document ne s'applique pas à votre situation, vous pouvez simplement ne pas en tenir compte.
      </p>

      <p>
        Si certains éléments sont encore manquants pour ${escapeHtml(fullChildren)}, merci de nous les transmettre
        par retour de mail dès que possible.
      </p>

      <p>À très bientôt,<br />L'équipe ColoCrew</p>
    </div>
  `;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.NEXT_USER_MAIL,
      pass: process.env.NEXT_USER_PASSWORD,
    },
  });
}

function requestSecret(request, url) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return bearer || url.searchParams.get("secret") || "";
}

async function handle(request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const configuredSecret = process.env.CRON_SECRET || "";

  if (configuredSecret && requestSecret(request, url) !== configuredSecret) {
    return Response.json({ error: "Accès refusé" }, { status: 401 });
  }

  if (!configuredSecret && !dryRun) {
    return Response.json(
      { error: "CRON_SECRET doit être configuré avant tout envoi automatique réel." },
      { status: 503 }
    );
  }

  const baseDate = url.searchParams.get("date") || formatParisDate(new Date());
  const targetDate = addDaysIso(baseDate, 7);
  const max = Number(url.searchParams.get("limit") || 0);

  if (!targetDate) {
    return Response.json({ error: "Date invalide. Format attendu : YYYY-MM-DD." }, { status: 400 });
  }

  const snap = await getDocs(collection(db, COLLECTIONS.RESERVATIONS));
  const candidates = snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((reservation) => reservation.status === "validated")
    .filter((reservation) => reservation.convocationSent === true)
    .filter((reservation) => reservation.convocationJ7ReminderSent !== true)
    .filter((reservation) => reservationEmail(reservation))
    .filter((reservation) => reservationStartDate(reservation) === targetDate);

  const selected = max > 0 ? candidates.slice(0, max) : candidates;

  if (dryRun) {
    return Response.json({
      dryRun: true,
      baseDate,
      targetDate,
      count: selected.length,
      candidates: selected.map((reservation) => ({
        id: reservation.id,
        email: maskEmail(reservationEmail(reservation)),
        sejour: reservation?.sejour?.name || reservation?.sejourName || "",
        enfants: childNames(reservation),
      })),
    });
  }

  const transporter = createTransporter();
  const sent = [];
  const errors = [];

  for (const reservation of selected) {
    const email = reservationEmail(reservation);
    const subject = `ColoCrew — Rappel J-7 avant le départ`;

    try {
      const info = await transporter.sendMail({
        from: `"ColoCrew" <contact@colocrew.com>`,
        replyTo: "contact@colocrew.com",
        to: email,
        subject,
        html: reminderHtml(reservation),
      });

      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, reservation.id), {
        convocationJ7ReminderSent: true,
        convocationJ7ReminderSentAt: serverTimestamp(),
        convocationJ7ReminderTargetDate: targetDate,
        convocationJ7ReminderMessageId: info.messageId || null,
      });

      sent.push({ id: reservation.id, email: maskEmail(email), messageId: info.messageId || null });
    } catch (error) {
      errors.push({ id: reservation.id, email: maskEmail(email), error: error.message });
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, reservation.id), {
        convocationJ7ReminderLastError: error.message,
        convocationJ7ReminderLastErrorAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  return Response.json({
    success: errors.length === 0,
    baseDate,
    targetDate,
    candidates: selected.length,
    sent: sent.length,
    errors,
  });
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
