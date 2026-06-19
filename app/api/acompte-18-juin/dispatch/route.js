import nodemailer from "nodemailer";
import Stripe from "stripe";
import { db } from "@/src/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

export const runtime = "nodejs";

const RUNS = "campagne_runs";
const ACOMPTES = "acompte_18_juin";
const RIB = {
  titulaire: "COLOCREW",
  iban: "FR76 1695 8000 0158 6780 6033 040",
  bic: "QNTOFRP1XXX",
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function createTransport() {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(baseMs) {
  const jitter = (Math.random() - 0.5) * 0.5 * baseMs;
  return Math.max(500, Math.round(baseMs + jitter));
}

export async function POST(request) {
  const {
    families,
    sender = { name: "ColoCrew Inscriptions", email: "inscriptions@colocrew.com" },
    replyTo = "inscriptions@colocrew.com",
    delayMs = 3000,
  } = await request.json();

  if (!families?.length || !sender?.email || !replyTo) {
    return Response.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const sentSnap = await getDocs(collection(db, ACOMPTES));
  const alreadySent = new Set(
    sentSnap.docs
      .filter((item) => ["email_sent", "deposit_paid"].includes(item.data()?.status))
      .map((item) => String(item.data()?.email || item.data()?.family?.email || "").toLowerCase().trim())
      .filter(Boolean),
  );
  const validFamilies = families.filter((family) => family?.valid && family.email);
  const skippedAlreadySent = validFamilies.filter((family) => alreadySent.has(String(family.email).toLowerCase().trim()));
  const skippedUnsubscribed = [];
  const targets = validFamilies.filter((family) => !alreadySent.has(String(family.email).toLowerCase().trim()));

  if (!targets.length) {
    return Response.json({ error: "Aucune famille valide à contacter" }, { status: 400 });
  }

  const subject = "Dernières places ColoCrew - acompte pour bloquer votre réservation";
  const total = targets.length;
  const transporter = createTransport();
  const encoder = new TextEncoder();
  const runRef = await addDoc(collection(db, RUNS), {
    type: "acompte-18-juin",
    subject,
    replyTo,
    total,
    selectedTotal: families.length,
    skippedUnsubscribed: skippedUnsubscribed.length,
    skippedAlreadySent: skippedAlreadySent.length,
    skippedInvalid: families.length - validFamilies.length,
    sent: 0,
    errors: 0,
    status: "running",
    currentEmail: "",
    currentSender: sender.email,
    senders: [sender.email],
    senderDetails: [sender],
    sourceMode: "xlsx-acompte-18-juin",
    canResume: false,
    delayMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  async function recordEvent(event) {
    await addDoc(collection(runRef, "events"), {
      ...event,
      createdAt: serverTimestamp(),
    });
  }

  async function shouldHalt(sent, errors) {
    const snap = await getDoc(runRef);
    const action = snap.data()?.controlAction;
    if (!["pause", "stop"].includes(action)) return null;
    const status = action === "pause" ? "paused" : "stopped";
    await updateDoc(runRef, {
      status,
      sent,
      errors,
      currentEmail: "",
      controlAction: "",
      updatedAt: serverTimestamp(),
      ...(status === "stopped" ? { finishedAt: serverTimestamp() } : {}),
    });
    await recordEvent({ type: status, sent, errors, total });
    return { status };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (line) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let sent = 0;
      let errors = 0;
      send({
        type: "start",
        runId: runRef.id,
        sent,
        errors,
        total,
        selectedTotal: families.length,
        skippedUnsubscribed: skippedUnsubscribed.length,
        skippedAlreadySent: skippedAlreadySent.length,
        skippedInvalid: families.length - validFamilies.length,
      });

      for (let i = 0; i < targets.length; i++) {
        const halt = await shouldHalt(sent, errors);
        if (halt) {
          send({ type: halt.status, runId: runRef.id, sent, errors, total });
          controller.close();
          return;
        }

        const family = targets[i];
        try {
          await updateDoc(runRef, {
            status: "running",
            currentEmail: family.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });

          const acompteRef = await addDoc(collection(db, ACOMPTES), {
            runId: runRef.id,
            email: family.email,
            family,
            status: "link_created",
            depositAmount: 100,
            paidAmount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const session = await createDepositSession(family, acompteRef.id);
          await updateDoc(doc(db, ACOMPTES, acompteRef.id), {
            stripeSessionId: session.id,
            stripeUrl: session.url,
            status: "email_pending",
            updatedAt: serverTimestamp(),
          });

          const html = buildAcompteEmailHtml(family, session.url);
          await transporter.sendMail({
            from: `"${sender.name}" <${sender.email}>`,
            to: family.email,
            replyTo,
            subject,
            html,
          });

          sent++;
          await updateDoc(runRef, {
            sent,
            errors,
            currentEmail: family.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await updateDoc(doc(db, ACOMPTES, acompteRef.id), {
            status: "email_sent",
            sentAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await recordEvent({
            type: "sent",
            email: family.email,
            sender: sender.email,
            reference: family.numeroDeReservation,
            stripeSessionId: session.id,
            sent,
            errors,
          });
          send({ type: "ok", runId: runRef.id, sent, errors, total, email: family.email, reference: family.numeroDeReservation });
        } catch (err) {
          errors++;
          await updateDoc(runRef, {
            sent,
            errors,
            currentEmail: family.email,
            currentSender: sender.email,
            lastError: err.message,
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "error", email: family.email, sender: sender.email, message: err.message, sent, errors });
          send({ type: "err", runId: runRef.id, sent, errors, total, email: family.email, message: err.message });
        }

        if (i < targets.length - 1) {
          const delay = jitteredDelay(delayMs);
          send({ type: "wait", delay, nextAt: Date.now() + delay });
          await sleep(delay);
        }
      }

      await updateDoc(runRef, {
        sent,
        errors,
        status: "done",
        currentEmail: "",
        currentSender: "",
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordEvent({ type: "done", sent, errors, total });
      send({
        type: "done",
        runId: runRef.id,
        sent,
        errors,
        total,
        selectedTotal: families.length,
        skippedUnsubscribed: skippedUnsubscribed.length,
        skippedAlreadySent: skippedAlreadySent.length,
        skippedInvalid: families.length - validFamilies.length,
      });
      controller.close();
    },
    async cancel() {
      await updateDoc(runRef, {
        status: "interrupted",
        updatedAt: serverTimestamp(),
      });
      await recordEvent({ type: "interrupted" });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

async function createDepositSession(family, acompteDocId) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const description = [
    `Réservation ${family.numeroDeReservation}`,
    family.stayName,
    family.week,
    dateRange(family.startDate, family.endDate),
    `${family.childCount} enfant${family.childCount > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" - ");

  return stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Acompte - ${family.stayName || "séjour ColoCrew"}`,
            description,
            images: [process.env.NEXT_PUBLIC_LOGO_URL].filter(Boolean),
          },
          unit_amount: 10000,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${baseUrl}/reservation?acompte=success&ref=${encodeURIComponent(family.numeroDeReservation)}`,
    cancel_url: `${baseUrl}/reservation?acompte=cancel&ref=${encodeURIComponent(family.numeroDeReservation)}`,
    metadata: {
      tokenUnique: family.tokenUnique,
      paymentType: "deposit",
      campaign: "acompte-18-juin",
      acompteDocId,
      numeroDeReservation: family.numeroDeReservation,
      email: family.email,
    },
    customer_email: family.email,
  });
}

function buildAcompteEmailHtml(family, link) {
  const p = family.pricing || {};
  const children = family.children?.map((child) => `${child.firstName} ${child.lastName}`.trim()).filter(Boolean).join(", ");
  const rows = [
    row("Séjour", `${escapeHtml(family.stayName || family.stayCode)}${family.week ? ` - ${escapeHtml(family.week)}` : ""}`),
    row("Dates", escapeHtml(dateRange(family.startDate, family.endDate))),
    children ? row("Enfant(s)", escapeHtml(children)) : "",
    row("Prix du séjour", fmtCur(p.stayPrice)),
    p.discountAmount > 0 ? row(`Réduction (${Math.round(p.discountRate * 100)}%)`, `- ${fmtCur(p.discountAmount)}`) : "",
    row("Prix calculé", fmtCur(p.priceAfterDiscount)),
    p.transportAmount > 0 ? row(`Transport${family.transportCity ? ` (${escapeHtml(family.transportCity)})` : ""}`, fmtCur(p.transportAmount)) : "",
    row("Total avant aide", fmtCur(p.totalBeforeAid)),
    p.cafAid > 0 ? row("Aide CAF / VACAF", `- ${fmtCur(p.cafAid)}`) : "",
    row("Reste à charge", fmtCur(p.totalDue), { accent: true }),
    row("Acompte demandé", fmtCur(100), { accent: true }),
    row("Reste après acompte", fmtCur(p.remainingAfterDeposit)),
  ].join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8f4fb;font-family:Arial,sans-serif;color:#1e1535;">
  <div style="max-width:640px;margin:0 auto;padding:24px 14px;">
    <div style="background:#fff;border-radius:18px;overflow:hidden;border:1px solid #f0e3ee;">
      <div style="background:#B8336A;color:#fff;padding:22px 26px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">ColoCrew - Été 2026</div>
        <h1 style="font-size:24px;line-height:1.2;margin:8px 0 0;">Dernières places disponibles</h1>
      </div>
      <div style="padding:24px 26px;">
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">Bonjour ${escapeHtml(family.responsible?.firstName || family.responsible?.lastName || "")},</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">Nous nous permettons de revenir vers vous car vous aviez manifesté votre intérêt pour un séjour ColoCrew cet été.</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">Il nous reste très peu de places sur ce séjour. Pour que nous puissions vous réserver la place en priorité, il suffit de régler un acompte de <strong>100 €</strong>. Cet acompte bloque la réservation et sera bien sûr déduit du reste à charge.</p>
        <div style="border:1px solid #f0e3ee;border-radius:10px;overflow:hidden;margin:8px 0 16px;">
          <div style="background:#B8336A;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:9px 14px;">Devis - réf. ${escapeHtml(family.numeroDeReservation)}</div>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
        </div>
        ${button(link, "Payer l'acompte de 100 €")}
        <p style="font-size:11.5px;color:#998aa8;text-align:center;margin:-4px 0 16px;">Le paiement par carte confirme le blocage de la réservation.</p>
        <div style="border:1px dashed #d8b9c8;border-radius:10px;padding:13px 16px;background:#fdf8fc;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7c3a6a;text-transform:uppercase;letter-spacing:.04em;">Ou par virement bancaire</p>
          <table style="width:100%;font-size:12.5px;color:#1e1535;border-collapse:collapse;">
            <tr><td style="padding:2px 0;color:#998aa8;width:84px;">Titulaire</td><td style="font-weight:600;">${RIB.titulaire}</td></tr>
            <tr><td style="padding:2px 0;color:#998aa8;">IBAN</td><td style="font-weight:600;">${RIB.iban}</td></tr>
            <tr><td style="padding:2px 0;color:#998aa8;">BIC</td><td style="font-weight:600;">${RIB.bic}</td></tr>
            <tr><td style="padding:2px 0;color:#998aa8;">Montant</td><td style="font-weight:600;">100 €</td></tr>
            <tr><td style="padding:2px 0;color:#998aa8;">Référence</td><td style="font-weight:600;">${escapeHtml(family.numeroDeReservation)}</td></tr>
          </table>
        </div>
        <p style="font-size:12.5px;color:#70627d;line-height:1.6;margin:16px 0 0;">Merci beaucoup pour votre confiance. N'hésitez pas à nous répondre si vous avez la moindre question ou si une information du devis doit être corrigée.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function row(label, value, opts = {}) {
  return `<tr>
    <td style="padding:7px 14px;font-size:13px;color:#5a4f6b;border-bottom:1px solid #f0e3ee;">${label}</td>
    <td style="padding:7px 14px;font-size:13px;text-align:right;font-weight:700;color:${opts.accent ? "#B8336A" : "#1e1535"};border-bottom:1px solid #f0e3ee;white-space:nowrap;">${value}</td>
  </tr>`;
}

function button(href, label) {
  return `<div style="text-align:center;margin:16px 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#B8336A;color:#fff;padding:13px 30px;text-decoration:none;border-radius:100px;font-weight:700;font-size:14px;box-shadow:0 4px 14px rgba(184,51,106,.3);">${label}</a>
  </div>`;
}

function dateRange(startDate, endDate) {
  if (!startDate && !endDate) return "";
  return `${formatDate(startDate)} au ${formatDate(endDate)}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtCur(value) {
  const n = Number(value || 0);
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
