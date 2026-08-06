import nodemailer from "nodemailer";
import { db } from "@/src/lib/firebase";
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

const RUNS = "campagne_runs";
const UNSUB = "campagne_unsubscribes";
const SEND_MAIL_TIMEOUT_MS = 8000;

export const maxDuration = 60;

function createTransport() {
  return nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.NEXT_USER_MAIL,
      pass: process.env.NEXT_USER_PASSWORD,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: SEND_MAIL_TIMEOUT_MS,
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Délai de base ±30% de variation aléatoire
function jitteredDelay(baseMs) {
  const jitter = (Math.random() - 0.5) * 0.6 * baseMs;
  return Math.max(500, Math.round(baseMs + jitter));
}

function personalize(html, contact) {
  return html
    .replace(/\{\{params\.PRENOM\}\}/gi, contact.prenom || "")
    .replace(/\{\{params\.NOM\}\}/gi,    contact.nom    || "")
    .replace(/\{+unsubscribe\}+/gi,      "#");
}

function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function sameCampaign(run, { subject, listId, listName }) {
  if (run.subject !== subject) return false;
  if (listId && run.listId === listId) return true;
  return Boolean(listName && run.listName === listName);
}

async function getPreviouslySentEmails({ subject, listId, listName }) {
  const runsSnap = await getDocs(collection(db, RUNS));
  const matchingRuns = runsSnap.docs.filter((runDoc) => sameCampaign(runDoc.data(), { subject, listId, listName }));
  const sentEmails = new Set();
  for (const runDoc of matchingRuns) {
    const eventsSnap = await getDocs(collection(runDoc.ref, "events"));
    eventsSnap.docs
      .map((eventDoc) => eventDoc.data())
      .filter((event) => event.type === "sent")
      .forEach((event) => {
        const email = normalizeEmail(event.email);
        if (email) sentEmails.add(email);
      });
  }
  return sentEmails;
}

function sendMailWithTimeout(transporter, message) {
  return Promise.race([
    transporter.sendMail(message),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout SMTP apres ${SEND_MAIL_TIMEOUT_MS / 1000}s`)), SEND_MAIL_TIMEOUT_MS);
    }),
  ]);
}

/**
 * POST /api/brevo/dispatch
 * Corps : { contacts, senders, subject, htmlContent, replyTo, delayMs }
 * Réponse : flux NDJSON (une ligne JSON par étape)
 */
export async function POST(request) {
  const {
    contacts,        // [{ email, prenom, nom }]
    senders,         // [{ name, email }]
    subject,
    htmlContent,
    replyTo,
    delayMs = 3000,
    sourceMode = "list",
    listId = "",
    listName = "",
    maxPerRequest = 2,
  } = await request.json();

  if (!contacts?.length || !senders?.length || !subject || !htmlContent || !replyTo) {
    return Response.json({ error: "Paramètres manquants — contacts, senders, subject, htmlContent et replyTo sont requis" }, { status: 400 });
  }

  const [unsubSnap, previouslySent] = await Promise.all([
    getDocs(collection(db, UNSUB)),
    getPreviouslySentEmails({ subject, listId, listName }),
  ]);
  const unsubscribed = new Set(unsubSnap.docs.map(d => normalizeEmail(d.data().email || d.id)));
  const filteredContacts = contacts.filter(c => {
    const email = normalizeEmail(c.email);
    return email && !unsubscribed.has(email) && !previouslySent.has(email);
  });

  if (!filteredContacts.length) {
    return Response.json({ error: "Tous les contacts sont desinscrits ou invalides" }, { status: 400 });
  }

  const transporter = createTransport();
  const encoder = new TextEncoder();
  const total = filteredContacts.length;
  const batchLimit = Math.max(1, Math.min(Number(maxPerRequest) || 2, 5));
  const runRef = await addDoc(collection(db, RUNS), {
    subject,
    replyTo,
    total,
    sent: 0,
    errors: 0,
    nextIndex: 0,
    status: "running",
    currentEmail: "",
    currentSender: "",
    senders: senders.map(s => s.email),
    senderDetails: senders,
    htmlContent,
    sourceMode,
    listId,
    listName,
    canResume: sourceMode === "list" && !!listId,
    delayMs,
    maxPerRequest: batchLimit,
    skippedAlreadySent: previouslySent.size,
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
    if (!["pause", "stop"].includes(action)) return false;
    const status = action === "pause" ? "paused" : "stopped";
    await updateDoc(runRef, {
      status,
      sent,
      errors,
      currentEmail: "",
      currentSender: "",
      controlAction: "",
      updatedAt: serverTimestamp(),
      ...(status === "stopped" ? { finishedAt: serverTimestamp() } : {}),
    });
    await recordEvent({ type: status, sent, errors, total });
    return { status };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = line => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));

      let sent = 0;
      let errors = 0;
      let sentThisBatch = 0;
      send({ type: "start", runId: runRef.id, sent, errors, total });

      for (let i = 0; i < filteredContacts.length; i++) {
        const halt = await shouldHalt(sent, errors);
        if (halt) {
          send({ type: halt.status, runId: runRef.id, sent, errors, total });
          controller.close();
          return;
        }
        const contact = filteredContacts[i];
        const sender  = senders[i % senders.length]; // Rotation circulaire

        try {
          await updateDoc(runRef, {
            status: "running",
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await sendMailWithTimeout(transporter, {
            from:    `"${sender.name}" <${sender.email}>`,
            to:      contact.email,
            replyTo,
            subject,
            html:    personalize(htmlContent, contact),
          });
          sent++;
          await updateDoc(runRef, {
            sent,
            errors,
            nextIndex: i + 1,
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "sent", email: contact.email, sender: sender.email, sent, errors });
          send({ type: "ok", runId: runRef.id, sent, errors, total, email: contact.email, sender: sender.email });
          sentThisBatch++;
        } catch (err) {
          errors++;
          await updateDoc(runRef, {
            sent,
            errors,
            nextIndex: i + 1,
            currentEmail: contact.email,
            currentSender: sender.email,
            lastError: err.message,
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "error", email: contact.email, sender: sender.email, message: err.message, sent, errors });
          send({ type: "err", runId: runRef.id, sent, errors, total, email: contact.email, message: err.message });
          sentThisBatch++;
        }

        // Délai aléatoire entre les envois (sauf après le dernier)
        if (sentThisBatch >= batchLimit && i < filteredContacts.length - 1) {
          await updateDoc(runRef, {
            status: "paused",
            nextIndex: i + 1,
            currentEmail: "",
            currentSender: "",
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "batch_done", sent, errors, total, remaining: total - sent });
          send({ type: "batchDone", runId: runRef.id, sent, errors, total, remaining: total - sent });
          controller.close();
          return;
        }

        if (i < filteredContacts.length - 1) {
          const delay = jitteredDelay(delayMs);
          send({ type: "wait", delay, nextAt: Date.now() + delay });
          await sleep(delay);
        }
      }

      await updateDoc(runRef, {
        sent,
        errors,
        nextIndex: filteredContacts.length,
        status: "done",
        currentEmail: "",
        currentSender: "",
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordEvent({ type: "done", sent, errors, total });
      send({ type: "done", runId: runRef.id, sent, errors, total });
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
      "Content-Type":      "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control":     "no-cache, no-transform",
    },
  });
}
