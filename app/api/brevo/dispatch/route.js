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
  writeBatch,
} from "firebase/firestore";

const CONTACTS = "campagne_contacts";
const RUNS = "campagne_runs";
const UNSUB = "campagne_unsubscribes";
const QUEUE_CHUNK_SIZE = 250;
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

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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

function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function sameCampaign(run, { subject, listId, listName }) {
  if (run.subject !== subject) return false;
  if (listId && run.listId === listId) return true;
  return Boolean(listName && run.listName === listName);
}

async function getPreviouslySentEmails({ subject, listId, listName }) {
  const runsSnapshot = await getDocs(collection(db, RUNS));
  const matchingRuns = runsSnapshot.docs.filter(snapshot => (
    sameCampaign(snapshot.data(), { subject, listId, listName })
  ));
  const sentEmails = new Set();

  for (const runSnapshot of matchingRuns) {
    const eventsSnapshot = await getDocs(collection(runSnapshot.ref, "events"));
    eventsSnapshot.docs
      .map(snapshot => snapshot.data())
      .filter(event => event.type === "sent")
      .forEach(event => {
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
      setTimeout(
        () => reject(new Error(`Timeout SMTP apres ${SEND_MAIL_TIMEOUT_MS / 1000}s`)),
        SEND_MAIL_TIMEOUT_MS,
      );
    }),
  ]);
}

async function persistQueue(runRef, contacts) {
  let batch = writeBatch(db);
  let writes = 0;
  let chunkCount = 0;

  for (let index = 0; index < contacts.length; index += QUEUE_CHUNK_SIZE) {
    const chunk = contacts.slice(index, index + QUEUE_CHUNK_SIZE);
    const chunkId = String(chunkCount).padStart(6, "0");
    batch.set(doc(runRef, "queue", chunkId), {
      index: chunkCount,
      contacts: chunk,
    });
    writes++;
    chunkCount++;

    if (writes === 400) {
      await batch.commit();
      batch = writeBatch(db);
      writes = 0;
    }
  }

  if (writes) await batch.commit();
  return chunkCount;
}

/**
 * Starts a campaign and returns its progress as NDJSON.
 * For a saved list, only listId is sent by the browser; contacts are resolved
 * once here and persisted as a compact queue for subsequent batches.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const {
    senders,
    subject,
    htmlContent,
    replyTo,
    delayMs = 3000,
    sourceMode = "list",
    listId = "",
    listName = "",
    maxPerRequest = 2,
  } = body;

  if (!senders?.length || !subject || !htmlContent || !replyTo) {
    return Response.json(
      { error: "Expediteur, objet, contenu et adresse de reponse sont requis" },
      { status: 400 },
    );
  }
  if (sourceMode === "list" && !listId) {
    return Response.json({ error: "Selectionnez une liste de contacts" }, { status: 400 });
  }
  if (sourceMode === "csv" && !body.contacts?.length) {
    return Response.json({ error: "Le fichier CSV ne contient aucun contact" }, { status: 400 });
  }

  const contactsSnapshot = sourceMode === "list"
    ? await getDocs(query(collection(db, CONTACTS), where("listId", "==", listId)))
    : null;
  const sourceContacts = sourceMode === "list"
    ? contactsSnapshot.docs.map(snapshot => snapshot.data())
    : body.contacts;

  const [unsubSnapshot, previouslySent] = await Promise.all([
    getDocs(collection(db, UNSUB)),
    getPreviouslySentEmails({ subject, listId, listName }),
  ]);
  const unsubscribed = new Set(
    unsubSnapshot.docs.map(snapshot => normalizeEmail(snapshot.data().email || snapshot.id)),
  );
  const uniqueEmails = new Set();
  const filteredContacts = sourceContacts
    .filter(contact => contact?.email)
    .sort((a, b) => (Number(b.scorePertinence) || 0) - (Number(a.scorePertinence) || 0))
    .reduce((result, contact) => {
      const email = normalizeEmail(contact.email);
      if (!email || uniqueEmails.has(email) || unsubscribed.has(email) || previouslySent.has(email)) {
        return result;
      }
      uniqueEmails.add(email);
      result.push({ email, prenom: contact.prenom || "", nom: contact.nom || "" });
      return result;
    }, []);

  if (!filteredContacts.length) {
    return Response.json(
      { error: "Aucun nouveau contact valide a envoyer pour cette campagne" },
      { status: 400 },
    );
  }

  const total = filteredContacts.length;
  const batchLimit = Math.max(1, Math.min(Number(maxPerRequest) || 2, 25));
  const runRef = await addDoc(collection(db, RUNS), {
    subject,
    replyTo,
    total,
    sent: 0,
    errors: 0,
    nextIndex: 0,
    status: "preparing",
    currentEmail: "",
    currentSender: "",
    senders: senders.map(sender => sender.email),
    senderDetails: senders,
    htmlContent,
    sourceMode,
    listId,
    listName,
    canResume: true,
    delayMs,
    maxPerRequest: batchLimit,
    queueVersion: 2,
    queueChunkSize: QUEUE_CHUNK_SIZE,
    queueChunkCount: 0,
    skippedAlreadySent: previouslySent.size,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    const queueChunkCount = await persistQueue(runRef, filteredContacts);
    await updateDoc(runRef, {
      status: "running",
      queueChunkCount,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await updateDoc(runRef, {
      status: "failed",
      lastError: error.message,
      updatedAt: serverTimestamp(),
    });
    return Response.json({ error: "Impossible de preparer la file d'envoi" }, { status: 500 });
  }

  const transporter = createTransport();
  const encoder = new TextEncoder();

  async function recordEvent(event) {
    await addDoc(collection(runRef, "events"), {
      ...event,
      createdAt: serverTimestamp(),
    });
  }

  async function shouldHalt(sent, errors) {
    const snapshot = await getDoc(runRef);
    const action = snapshot.data()?.controlAction;
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
      const send = line => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let sent = 0;
      let errors = 0;
      let processedThisBatch = 0;
      send({ type: "start", runId: runRef.id, sent, errors, total });

      for (let index = 0; index < filteredContacts.length; index++) {
        const halt = await shouldHalt(sent, errors);
        if (halt) {
          send({ type: halt.status, runId: runRef.id, sent, errors, total });
          controller.close();
          return;
        }

        const contact = filteredContacts[index];
        const sender = senders[index % senders.length];
        try {
          await updateDoc(runRef, {
            status: "running",
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await sendMailWithTimeout(transporter, {
            from: `"${sender.name}" <${sender.email}>`,
            to: contact.email,
            replyTo,
            subject,
            html: personalize(htmlContent, contact),
          });
          sent++;
          await updateDoc(runRef, {
            sent,
            errors,
            nextIndex: index + 1,
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "sent", email: contact.email, sender: sender.email, sent, errors });
          send({ type: "ok", runId: runRef.id, sent, errors, total, email: contact.email, sender: sender.email });
        } catch (error) {
          errors++;
          await updateDoc(runRef, {
            sent,
            errors,
            nextIndex: index + 1,
            currentEmail: contact.email,
            currentSender: sender.email,
            lastError: error.message,
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "error", email: contact.email, sender: sender.email, message: error.message, sent, errors });
          send({ type: "err", runId: runRef.id, sent, errors, total, email: contact.email, message: error.message });
        }
        processedThisBatch++;

        if (processedThisBatch >= batchLimit && index < filteredContacts.length - 1) {
          const nextIndex = index + 1;
          await updateDoc(runRef, {
            status: "paused",
            nextIndex,
            currentEmail: "",
            currentSender: "",
            updatedAt: serverTimestamp(),
          });
          await recordEvent({ type: "batch_done", sent, errors, total, remaining: total - nextIndex });
          send({ type: "batchDone", runId: runRef.id, sent, errors, total, remaining: total - nextIndex });
          controller.close();
          return;
        }

        if (index < filteredContacts.length - 1) {
          const delay = jitteredDelay(delayMs);
          send({ type: "wait", delay, nextAt: Date.now() + delay });
          await sleep(delay);
        }
      }

      await updateDoc(runRef, {
        sent,
        errors,
        nextIndex: total,
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
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
