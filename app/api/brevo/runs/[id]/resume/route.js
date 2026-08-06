import nodemailer from "nodemailer";
import { db } from "@/src/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const CONTACTS = "campagne_contacts";
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

function jitteredDelay(baseMs) {
  const jitter = (Math.random() - 0.5) * 0.6 * baseMs;
  return Math.max(500, Math.round(baseMs + jitter));
}

function personalize(html, contact) {
  return html
    .replace(/\{\{params\.PRENOM\}\}/gi, contact.prenom || "")
    .replace(/\{\{params\.NOM\}\}/gi, contact.nom || "")
    .replace(/\{+unsubscribe\}+/gi, "#");
}

async function recordEvent(runRef, event) {
  await addDoc(collection(runRef, "events"), {
    ...event,
    createdAt: serverTimestamp(),
  });
}

async function shouldHalt(runRef, sent, errors, total) {
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
  await recordEvent(runRef, { type: status, sent, errors, total });
  return { status };
}

export async function POST(request, context) {
  const body = await request.json().catch(() => ({}));
  const maxPerRequest = Math.max(1, Math.min(Number(body.maxPerRequest || 8) || 8, 25));
  const { id } = await context.params;
  const runRef = doc(db, RUNS, id);
  const runSnap = await getDoc(runRef);

  if (!runSnap.exists()) {
    return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  const run = runSnap.data();
  if (!run.listId || !run.htmlContent || !run.subject || !run.replyTo) {
    return Response.json({ error: "Cette campagne ne contient pas assez d'informations pour etre reprise" }, { status: 400 });
  }

  const senders = Array.isArray(run.senderDetails) && run.senderDetails.length
    ? run.senderDetails
    : (run.senders || []).map(email => ({ name: "ColoCrew", email }));

  if (!senders.length) {
    return Response.json({ error: "Aucun expediteur sauvegarde pour cette campagne" }, { status: 400 });
  }

  const [contactsSnap, unsubSnap, eventsSnap] = await Promise.all([
    getDocs(query(collection(db, CONTACTS), where("listId", "==", run.listId))),
    getDocs(collection(db, UNSUB)),
    getDocs(collection(runRef, "events")),
  ]);

  const unsubscribed = new Set(unsubSnap.docs.map(d => String(d.data().email || d.id).toLowerCase().trim()));
  const alreadySent = new Set(
    eventsSnap.docs
      .map(d => d.data())
      .filter(ev => ev.type === "sent")
      .map(ev => String(ev.email || "").toLowerCase().trim())
      .filter(Boolean)
  );

  const remaining = contactsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.email)
    .filter(c => !unsubscribed.has(String(c.email).toLowerCase().trim()))
    .filter(c => !alreadySent.has(String(c.email).toLowerCase().trim()))
    .sort((a, b) => (Number(b.scorePertinence) || 0) - (Number(a.scorePertinence) || 0));

  if (!remaining.length) {
    await updateDoc(runRef, {
      status: "done",
      currentEmail: "",
      currentSender: "",
      updatedAt: serverTimestamp(),
      finishedAt: serverTimestamp(),
    });
    return Response.json({ error: "Aucun contact restant a envoyer" }, { status: 400 });
  }

  await updateDoc(runRef, {
    status: "running",
    currentEmail: "",
    currentSender: "",
    lastError: "",
    updatedAt: serverTimestamp(),
  });
  await recordEvent(runRef, { type: "resumed", remaining: remaining.length, sent: run.sent || 0, errors: run.errors || 0 });

  const transporter = createTransport();
  const encoder = new TextEncoder();
  const total = Number(run.total || contactsSnap.size || remaining.length);
  const delayMs = Number(run.delayMs || 3000);

  const stream = new ReadableStream({
    async start(controller) {
      const send = line => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      let sent = Number(run.sent || alreadySent.size || 0);
      let errors = Number(run.errors || 0);
      let sentThisBatch = 0;

      send({ type: "start", runId: id, sent, errors, total, remaining: remaining.length });

      for (let i = 0; i < remaining.length; i++) {
        const halt = await shouldHalt(runRef, sent, errors, total);
        if (halt) {
          send({ type: halt.status, runId: id, sent, errors, total });
          controller.close();
          return;
        }
        const contact = remaining[i];
        const sender = senders[(sent + i) % senders.length];

        try {
          await updateDoc(runRef, {
            status: "running",
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await transporter.sendMail({
            from: `"${sender.name}" <${sender.email}>`,
            to: contact.email,
            replyTo: run.replyTo,
            subject: run.subject,
            html: personalize(run.htmlContent, contact),
          });
          sent++;
          await updateDoc(runRef, {
            sent,
            errors,
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await recordEvent(runRef, { type: "sent", email: contact.email, sender: sender.email, sent, errors });
          send({ type: "ok", runId: id, sent, errors, total, email: contact.email, sender: sender.email });
          sentThisBatch++;
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
          await recordEvent(runRef, { type: "error", email: contact.email, sender: sender.email, message: err.message, sent, errors });
          send({ type: "err", runId: id, sent, errors, total, email: contact.email, message: err.message });
          sentThisBatch++;
        }

        if (sentThisBatch >= maxPerRequest && i < remaining.length - 1) {
          await updateDoc(runRef, {
            status: "paused",
            currentEmail: "",
            currentSender: "",
            updatedAt: serverTimestamp(),
          });
          await recordEvent(runRef, { type: "batch_done", sent, errors, total, remaining: total - sent });
          send({ type: "batchDone", runId: id, sent, errors, total, remaining: total - sent });
          controller.close();
          return;
        }

        if (i < remaining.length - 1) {
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
      await recordEvent(runRef, { type: "done", sent, errors, total });
      send({ type: "done", runId: id, sent, errors, total });
      controller.close();
    },
    async cancel() {
      await updateDoc(runRef, {
        status: "interrupted",
        updatedAt: serverTimestamp(),
      });
      await recordEvent(runRef, { type: "interrupted" });
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
