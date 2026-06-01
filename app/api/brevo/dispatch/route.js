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
  } = await request.json();

  if (!contacts?.length || !senders?.length || !subject || !htmlContent || !replyTo) {
    return Response.json({ error: "Paramètres manquants — contacts, senders, subject, htmlContent et replyTo sont requis" }, { status: 400 });
  }

  const unsubSnap = await getDocs(collection(db, UNSUB));
  const unsubscribed = new Set(unsubSnap.docs.map(d => String(d.data().email || d.id).toLowerCase().trim()));
  const filteredContacts = contacts.filter(c => !unsubscribed.has(String(c.email || "").toLowerCase().trim()));

  if (!filteredContacts.length) {
    return Response.json({ error: "Tous les contacts sont desinscrits ou invalides" }, { status: 400 });
  }

  const transporter = createTransport();
  const encoder = new TextEncoder();
  const total = filteredContacts.length;
  const runRef = await addDoc(collection(db, RUNS), {
    subject,
    replyTo,
    total,
    sent: 0,
    errors: 0,
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
          await transporter.sendMail({
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
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "sent", email: contact.email, sender: sender.email, sent, errors });
          send({ type: "ok", runId: runRef.id, sent, errors, total, email: contact.email, sender: sender.email });
        } catch (err) {
          errors++;
          await updateDoc(runRef, {
            sent,
            errors,
            currentEmail: contact.email,
            currentSender: sender.email,
            lastError: err.message,
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "error", email: contact.email, sender: sender.email, message: err.message, sent, errors });
          send({ type: "err", runId: runRef.id, sent, errors, total, email: contact.email, message: err.message });
        }

        // Délai aléatoire entre les envois (sauf après le dernier)
        if (i < filteredContacts.length - 1) {
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
