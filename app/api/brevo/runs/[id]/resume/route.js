import { adminDb } from "@/src/lib/serverFirebase";
import { FieldValue } from "firebase-admin/firestore";
import { withDashboardAccess } from "@/src/lib/serverAdminAuth";
import nodemailer from "nodemailer";

import { unsubscribeHeaders, withUnsubscribeLink } from "@/src/lib/unsubscribe";

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
  return withUnsubscribeLink(html, contact.email)
    .replace(/\{\{params\.PRENOM\}\}/gi, contact.prenom || "")
    .replace(/\{\{params\.NOM\}\}/gi, contact.nom || "");
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
  await runRef.collection("events").add({
    ...event,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function readRunState(runRef, sent, errors, total, fallbackDelayMs) {
  const snapshot = await runRef.get();
  const runData = snapshot.data() || {};
  const action = runData.controlAction;
  const currentDelayMs = Number(runData.delayMs || fallbackDelayMs || 3000);
  if (!["pause", "stop"].includes(action)) return { delayMs: currentDelayMs };
  const status = action === "pause" ? "paused" : "stopped";
  await runRef.update({
    status,
    sent,
    errors,
    currentEmail: "",
    currentSender: "",
    controlAction: "",
    updatedAt: FieldValue.serverTimestamp(),
    ...(status === "stopped" ? { finishedAt: FieldValue.serverTimestamp() } : {}),
  });
  await recordEvent(runRef, { type: status, sent, errors, total });
  return { status, delayMs: currentDelayMs };
}

async function readQueue(runRef, startIndex, count, chunkSize) {
  const queued = [];
  let cursor = startIndex;

  while (queued.length < count) {
    const chunkIndex = Math.floor(cursor / chunkSize);
    const chunkOffset = cursor % chunkSize;
    const chunkId = String(chunkIndex).padStart(6, "0");
    const chunkSnapshot = await runRef.collection("queue").doc(chunkId).get();
    if (!chunkSnapshot.exists) break;

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

async function handlePOST(request, context) {
  const body = await request.json().catch(() => ({}));
  const maxPerRequest = Math.max(1, Math.min(Number(body.maxPerRequest || 2) || 2, 25));
  const { id } = await context.params;
  const runRef = adminDb().collection(RUNS).doc(id);
  const runSnapshot = await runRef.get();

  if (!runSnapshot.exists) {
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
    await runRef.update({
      status: "done",
      currentEmail: "",
      currentSender: "",
      updatedAt: FieldValue.serverTimestamp(),
      finishedAt: FieldValue.serverTimestamp(),
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

  await runRef.update({
    status: "running",
    currentEmail: "",
    currentSender: "",
    lastError: "",
    updatedAt: FieldValue.serverTimestamp(),
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
        const runState = await readRunState(runRef, sent, errors, total, delayMs);
        if (runState.status) {
          send({ type: runState.status, runId: id, sent, errors, total });
          controller.close();
          return;
        }

        const { contact, index } = queued[position];
        const sender = senders[index % senders.length];
        try {
          await runRef.update({
            status: "running",
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await sendMailWithTimeout(transporter, {
            from: `"${sender.name}" <${sender.email}>`,
            to: contact.email,
            replyTo: run.replyTo,
            subject: run.subject,
            html: personalize(run.htmlContent, contact),
            headers: unsubscribeHeaders(contact.email),
          });
          sent++;
          nextIndex = index + 1;
          await runRef.update({
            sent,
            errors,
            nextIndex,
            currentEmail: contact.email,
            currentSender: sender.email,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await recordEvent(runRef, { type: "sent", email: contact.email, sender: sender.email, sent, errors });
          send({ type: "ok", runId: id, sent, errors, total, email: contact.email, sender: sender.email });
        } catch (error) {
          errors++;
          nextIndex = index + 1;
          await runRef.update({
            sent,
            errors,
            nextIndex,
            currentEmail: contact.email,
            currentSender: sender.email,
            lastError: error.message,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await recordEvent(runRef, { type: "error", email: contact.email, sender: sender.email, message: error.message, sent, errors });
          send({ type: "err", runId: id, sent, errors, total, email: contact.email, message: error.message });
        }

        if (position < queued.length - 1) {
          const delay = jitteredDelay(runState.delayMs);
          send({ type: "wait", delay, nextAt: Date.now() + delay });
          await sleep(delay);
        }
      }

      if (nextIndex < total) {
        await runRef.update({
          status: "paused",
          nextIndex,
          currentEmail: "",
          currentSender: "",
          updatedAt: FieldValue.serverTimestamp(),
        });
        await recordEvent(runRef, { type: "batch_done", sent, errors, total, remaining: total - nextIndex });
        send({ type: "batchDone", runId: id, sent, errors, total, remaining: total - nextIndex });
        controller.close();
        return;
      }

      await runRef.update({
        sent,
        errors,
        nextIndex: total,
        status: "done",
        currentEmail: "",
        currentSender: "",
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await recordEvent(runRef, { type: "done", sent, errors, total });
      send({ type: "done", runId: id, sent, errors, total });
      controller.close();
    },
    async cancel() {
      await runRef.update({
        status: "interrupted",
        updatedAt: FieldValue.serverTimestamp(),
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

export const POST = withDashboardAccess(["campaigns"], handlePOST);
