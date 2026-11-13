import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/app/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { availabilityLabel, interestLabel, validateVolunteer } from "@/src/lib/volunteers";

const ADMIN_EMAIL = "contact@colocrew.com";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

/** Tells the team someone wants to help. Never blocks the submission. */
async function notifyTeam(volunteer) {
  if (!process.env.NEXT_USER_MAIL || !process.env.NEXT_USER_PASSWORD) return;
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 587,
    secure: false,
    auth: { user: process.env.NEXT_USER_MAIL, pass: process.env.NEXT_USER_PASSWORD },
  });
  const name = `${volunteer.firstName} ${volunteer.lastName}`;
  const rows = [
    ["Téléphone", volunteer.phone],
    ["Email", volunteer.email],
    ["Missions", volunteer.interests.map(interestLabel).join(", ")],
    ["Disponibilité", availabilityLabel(volunteer.availability)],
    ["Message", volunteer.message],
  ].filter(([, value]) => value);
  await transporter.sendMail({
    from: '"ColoCrew" <contact@colocrew.com>',
    to: ADMIN_EMAIL,
    replyTo: volunteer.email,
    subject: `Nouveau bénévole : ${name}`,
    text: `${name} veut aider ColoCrew.\n\n${rows.map(([label, value]) => `${label} : ${value}`).join("\n")}\n\nÀ retrouver dans le dashboard : https://www.colocrew.com/dashboard/benevoles`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f1640">
      <h2 style="color:#B8336A;margin:0 0 12px">${escapeHtml(name)} veut aider ColoCrew</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows
        .map(([label, value]) => `<tr><td style="color:#6f648f;vertical-align:top">${label}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`)
        .join("")}</table>
      <p style="margin-top:18px"><a href="https://www.colocrew.com/dashboard/benevoles" style="color:#B8336A">Voir dans le dashboard</a></p>
    </div>`,
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // Champ piège invisible : seuls les robots le remplissent.
  if (String(body?.website || "").trim()) return NextResponse.json({ ok: true });

  const { value, errors } = validateVolunteer(body);
  if (errors) return NextResponse.json({ error: "Il manque des informations.", fields: errors }, { status: 400 });

  try {
    await addDoc(collection(db, COLLECTIONS.VOLUNTEERS), {
      ...value,
      status: "new",
      notes: "",
      source: "edito-2026",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("[benevoles] enregistrement impossible:", error);
    return NextResponse.json({ error: "Enregistrement impossible pour le moment. Écris-nous à contact@colocrew.com." }, { status: 500 });
  }

  try {
    await notifyTeam(value);
  } catch (error) {
    console.error("[benevoles] email équipe non envoyé:", error);
  }

  return NextResponse.json({ ok: true });
}
