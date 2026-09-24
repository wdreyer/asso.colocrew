import nodemailer from "nodemailer";
import { db } from "@/src/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

const RUNS = "campagne_runs";
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

async function recordEvent(runRef, event) {
  await addDoc(collection(runRef, "events"), {
    ...event,
    createdAt: serverTimestamp(),
  });
}

async function shouldHalt(runRef, sent, errors, total) {
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
  await recordEvent(runRef, { type: status, sent, errors, total });
  return { status };
}

async function readQueue(runRef, startIndex, count, chunkSize) {
  const queued = [];
  let cursor = startIndex;

  while (queued.length < count) {
    const chunkIndex = Math.floor(cursor / chunkSize);
    const chunkOffset = cursor % chunkSize;
    const chunkId = String(chunkIndex).padStart(6, "0");
    const chunkSnapshot = await getDoc(doc(runRef, "queue", chunkId));
    if (!chunkSnapshot.exists()) break;

    const contacts = chunkSnapshot.data().contacts || [];
    if (chunkOffset >= contacts.length) break;
    const take = Math.min(count - queued.length, contacts.length - chunkOffset);
    for (let offset = 0; offset < take; offset++) {
      queued.push({
        index: cursor + offset,
        contact: contacts[chunkOffset + offset],
      });
    }
    cursor += take;
  }

  return queued;
}

export async function POST(request, context) {
  const body = await request.json().catch(() => ({}));
  const maxPerRequest = Math.max(1, Math.min(Number(body.maxPerRequest || 2) || 2, 25));
  const { id } = await context.params;
  const runRef = doc(db, RUNS, id);
  const runSnapshot = await getDoc(runRef);

  if (!runSnapshot.exists()) {
    return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  const run = runSnapshot.data();
  if (run.queueVersion !== 2 || !run.queueChunkSize) {
    return Response.json(
      { error: "Cette ancienne campagne ne possede pas de file d'envoi. Relancez-la depuis Nouvelle campagne." },
      { status: 409 },
    );
  }
  if (!run.htmlContent || !run.subject || !run.replyTo) {
    return Response.json(
      { error: "Cette campagne ne contient pas assez d'informations pour etre reprise" },
      { status: 400 },
    );
  }

  const senders = Array.isArray(run.senderDetails) && run.senderDetails.length
    ? run.senderDetails
    : (run.senders || []).map(email => ({ name: "ColoCrew", email }));
  if (!senders.length) {
    return Response.json({ error: "Aucun expediteur sauvegarde pour cette campagne" }, { status: 400 });
  }

  const total = Number(run.total || 0);
  const startIndex = Math.max(
    0,
    Number(run.nextIndex ?? (Number(run.sent || 0) + Number(run.errors || 0))) || 0,
  );
  if (!total || startIndex >= total) {
    await updateDoc(runRef, {
      status: "done",
      currentEmail: "",
      currentSender: "",
      updatedAt: serverTimestamp(),
      finishedAt: serverTimestamp(),
    });
    return Response.json({ error: "Cette campagne est deja terminee" }, { status: 409 });
  }

  const queued = await readQueue(
    runRef,
    startIndex,
    Math.min(maxPerRequest, total - startIndex),
    Number(run.queueChunkSize),
  );
  if (!queued.length) {
    return Response.json({ error: "La file d'envoi est incomplete" }, { status: 409 });
  }

  await updateDoc(runRef, {
    status: "running",
    currentEmail: "",
    currentSender: "",
    lastError: "",
    updatedAt: serverTimestamp(),
  });
  await recordEvent(runRef, {
    type: "resumed",
    remaining: total - startIndex,
    sent: run.sent || 0,
    errors: run.errors || 0,
  });

  const transporter = createTransport();
  const encoder = new TextEncoder();
  const delayMs = Number(run.delayMs || 3000);

  const stream = new ReadableStream({
    async start(controller) {
      const send = line => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let sent = Number(run.sent || 0);
      let errors = Number(run.errors || 0);
      let nextIndex = startIndex;

      send({ type: "start", runId: id, sent, errors, total, remaining: total - startIndex });

      for (let position = 0; position < queued.length; position++) {
        const halt = await shouldHalt(runRef, sent, errors, total);
        if (halt) {
          send({ type: halt.status, runId: id, sent, errors, total });
          controller.close();
          return;
        }

        const { contact, index } = queued[position];
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
            replyTo: run.replyTo,
            subject: run.subject,
            html: personalize(run.htmlContent, contact),
          });
          sent++;
          nextIndex = index + 1;
          await updateDoc(runRef, {
            sent,
            errors,
            nextIndex,
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: serverTimestamp(),
          });
          await recordEvent(runRef, { type: "sent", email: contact.email, sender: sender.email, sent, errors });
          send({ type: "ok", runId: id, sent, errors, total, email: contact.email, sender: sender.email });
        } catch (error) {
          errors++;
          nextIndex = index + 1;
          await updateDoc(runRef, {
            sent,
            errors,
            nextIndex,
            currentEmail: contact.email,
            currentSender: sender.email,
            lastError: error.message,
            updatedAt: serverTimestamp(),
          });
          await recordEvent(runRef, { type: "error", email: contact.email, sender: sender.email, message: error.message, sent, errors });
          send({ type: "err", runId: id, sent, errors, total, email: contact.email, message: error.message });
        }

        if (position < queued.length - 1) {
          const delay = jitteredDelay(delayMs);
          send({ type: "wait", delay, nextAt: Date.now() + delay });
          await sleep(delay);
        }
      }

      if (nextIndex < total) {
        await updateDoc(runRef, {
          status: "paused",
          nextIndex,
          currentEmail: "",
          currentSender: "",
          updatedAt: serverTimestamp(),
        });
        await recordEvent(runRef, { type: "batch_done", sent, errors, total, remaining: total - nextIndex });
        send({ type: "batchDone", runId: id, sent, errors, total, remaining: total - nextIndex });
        controller.close();
        return;
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
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
