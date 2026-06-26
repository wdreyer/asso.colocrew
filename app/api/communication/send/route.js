import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

const PURPLE     = rgb(0.72, 0.2,  0.41);
const DARK       = rgb(0.12, 0.06, 0.25);
const GREY       = rgb(0.4,  0.4,  0.4);
const LIGHT_GREY = rgb(0.97, 0.97, 0.97);
const GREEN      = rgb(0.09, 0.64, 0.27);
const MAX_UPLOAD_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

async function generateConvocPdf(convocData) {
  const { sejourName, responsable, children, rdvInfo, retour, emergencyPhones } = convocData;
  const pdfDoc = await PDFDocument.create();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const allChildren = (children?.length ? children : [{ firstName: responsable?.nom || "", lastName: "" }]);

  for (const child of allChildren) {
    const page   = pdfDoc.addPage([595.28, 841.89]); // A4
    const W      = page.getWidth();
    const margin = 45;
    let   y      = page.getHeight() - 45;

    const draw  = (text, x, yy, size, f, color) => page.drawText(String(text || ""), { x, y: yy, size, font: f, color: color || DARK });
    const line  = (x1, yy, x2, color, w) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: w || 1, color: color || GREY });
    const rect  = (x, yy, w, h, col) => page.drawRectangle({ x, y: yy - h, width: w, height: h, color: col });

    // ── En-tête ──
    draw("ColoCrew", margin, y, 22, fontBold, PURPLE);
    draw("Association de séjours éducatifs", margin, y - 16, 9, font, GREY);
    draw("CONVOCATION DE TRANSPORT", W - margin - 200, y, 11, fontBold, DARK);
    draw(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), W - margin - 200, y - 14, 9, font, GREY);
    y -= 38;
    line(margin, y, W - margin, PURPLE, 1.5);
    y -= 16;

    // ── Séjour badge ──
    const sejourLabel = truncate(sejourName || "Séjour ColoCrew", 60);
    rect(margin, y + 4, W - margin * 2, 22, LIGHT_GREY);
    draw(sejourLabel, margin + 10, y - 4, 11, fontBold, DARK);
    y -= 28;

    // ── Jeune ──
    const childName = `${child.firstName || ""} ${child.lastName || ""}`.trim() || "—";
    draw("PARTICIPANT", margin, y, 8, fontBold, GREY);
    y -= 14;
    draw(childName, margin, y, 15, fontBold, PURPLE);
    if (child.birthDate) { draw(`Né(e) le ${child.birthDate}`, margin, y - 13, 9, font, GREY); y -= 13; }
    y -= 20;
    line(margin, y, W - margin, LIGHT_GREY);
    y -= 14;

    // ── Responsable ──
    draw("RESPONSABLE LÉGAL", margin, y, 8, fontBold, GREY);
    y -= 14;
    draw(responsable?.nom || "—", margin, y, 11, fontBold);
    draw(responsable?.phone || "", margin + 250, y, 11, font);
    y -= 22;
    line(margin, y, W - margin, LIGHT_GREY);
    y -= 14;

    // ── Transport aller ──
    draw("INFORMATIONS DE TRANSPORT — ALLER", margin, y, 8, fontBold, GREY);
    y -= 16;

    const rows = [
      ["Date", convocData.dateLabel || "—"],
      ["Ville de départ", truncate(rdvInfo?.city || convocData.departureCity || "—", 50)],
      rdvInfo?.rdvTime  ? ["Heure de RDV",     rdvInfo.rdvTime + (rdvInfo.trainTime ? ` (train ${rdvInfo.trainTime})` : "")] : null,
      rdvInfo?.meetingPoint && rdvInfo.stopType !== "quai" ? ["Point de RDV", truncate(rdvInfo.meetingPoint, 50)] : null,
      rdvInfo?.stopType === "quai" ? ["Lieu", "Directement sur le quai" + (rdvInfo.platform ? ` — voie ${rdvInfo.platform}` : "")] : null,
      rdvInfo?.trainLabel ? ["Train", truncate(rdvInfo.trainLabel, 50)] : null,
      rdvInfo?.arrivalTime ? ["Arrivée prévue", rdvInfo.arrivalTime + (rdvInfo.arrivalCity ? ` à ${rdvInfo.arrivalCity}` : "")] : null,
    ].filter(Boolean);

    for (const [label, value] of rows) {
      rect(margin, y + 3, 130, 16, LIGHT_GREY);
      draw(label, margin + 6, y - 5, 9, fontBold, GREY);
      draw(value, margin + 140, y - 5, 10, font);
      y -= 18;
    }

    // ── Retour ──
    if (retour) {
      y -= 8;
      line(margin, y, W - margin, LIGHT_GREY);
      y -= 14;
      draw("INFORMATIONS DE RETOUR", margin, y, 8, fontBold, GREY);
      y -= 16;

      const retourRows = [
        retour.dateLabel ? ["Date", retour.dateLabel] : null,
        ["Lieu de récupération", "À la descente du quai — communiqué par l'animateur·ice"],
        retour.trainLabel ? ["Train", truncate(retour.trainLabel, 50)] : null,
        retour.arrivalTime ? ["Heure d'arrivée", retour.arrivalTime + (retour.arrivalCity ? ` à ${retour.arrivalCity}` : "")] : null,
      ].filter(Boolean);

      for (const [label, value] of retourRows) {
        rect(margin, y + 3, 130, 16, LIGHT_GREY);
        draw(label, margin + 6, y - 5, 9, fontBold, GREY);
        draw(truncate(value, 70), margin + 140, y - 5, 10, font);
        y -= 18;
      }
    }

    // ── Contacts urgence ──
    y -= 12;
    line(margin, y, W - margin, LIGHT_GREY);
    y -= 14;
    draw("CONTACTS D'URGENCE", margin, y, 8, fontBold, GREY);
    y -= 14;
    const phones = emergencyPhones?.length ? emergencyPhones : ["Marion Errard : 06 11 91 37 64", "William Dreyer : 06 87 91 68 97"];
    for (const p of phones) { draw(p, margin, y, 10, font); y -= 14; }

    // ── Zone signature ──
    y -= 10;
    line(margin, y, W - margin, LIGHT_GREY);
    y -= 20;
    const sigW = (W - margin * 2 - 20) / 2;
    rect(margin, y, sigW, 50, LIGHT_GREY);
    rect(margin + sigW + 20, y, sigW, 50, LIGHT_GREY);
    draw("Signature responsable légal", margin + 8, y - 10, 8, font, GREY);
    draw("(remise de l'enfant)", margin + 8, y - 21, 8, font, GREY);
    draw("Signature convoyeur", margin + sigW + 28, y - 10, 8, font, GREY);
    draw("(prise en charge)", margin + sigW + 28, y - 21, 8, font, GREY);

    // ── Pied de page ──
    draw("Association ColoCrew · SIRET : 932 171 432 00010 · contact@colocrew.com · 01 84 21 02 30", margin, 25, 7.5, font, GREY);
  }

  return pdfDoc.save();
}

async function parseSendRequest(request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json();
    return { ...body, uploadedAttachments: [] };
  }

  const form = await request.formData();
  const uploadedAttachments = [];
  let totalBytes = 0;

  for (const file of form.getAll("attachments")) {
    if (!file || typeof file.arrayBuffer !== "function" || !file.size) continue;
    totalBytes += Number(file.size || 0);
    if (totalBytes > MAX_UPLOAD_ATTACHMENT_BYTES) {
      throw new Error("Les pièces jointes dépassent 20 Mo au total.");
    }
    uploadedAttachments.push({
      filename: file.name || "piece-jointe",
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    });
  }

  let convocData = null;
  const rawConvocData = form.get("convocData");
  if (rawConvocData) {
    try {
      convocData = JSON.parse(String(rawConvocData));
    } catch {
      throw new Error("convocData invalide.");
    }
  }

  return {
    to: String(form.get("to") || ""),
    subject: String(form.get("subject") || ""),
    html: String(form.get("html") || ""),
    from_name: String(form.get("from_name") || ""),
    from_email: String(form.get("from_email") || ""),
    includeDecharge: String(form.get("includeDecharge") || "") === "true",
    convocData,
    uploadedAttachments,
  };
}

export async function POST(request) {
  try {
    const { to, subject, html, from_name, from_email, includeDecharge, convocData, uploadedAttachments = [] } = await parseSendRequest(request);

    if (!to || !subject || !html) {
      return Response.json({ error: "Paramètres manquants (to, subject, html)" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp-relay.sendinblue.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.NEXT_USER_MAIL,
        pass: process.env.NEXT_USER_PASSWORD,
      },
    });

    const attachments = [];
    attachments.push(...uploadedAttachments);

    if (includeDecharge) {
      const dechargePath = path.join(process.cwd(), "public", "documents", "decharge-responsabilite-colocrew.pdf");
      const content = await fs.readFile(dechargePath);
      attachments.push({
        filename: "Décharge de responsabilité ColoCrew.pdf",
        content,
        contentType: "application/pdf",
      });
    }

    if (convocData) {
      const pdfBytes = await generateConvocPdf(convocData);
      attachments.push({
        filename: "Convocation ColoCrew.pdf",
        content: Buffer.from(pdfBytes),
        contentType: "application/pdf",
      });
    }

    const info = await transporter.sendMail({
      from: `"${from_name || "ColoCrew"}" <${from_email || "contact@colocrew.com"}>`,
      to,
      subject,
      html,
      attachments: attachments.length ? attachments : undefined,
    });

    // Copie admin séparée avec préfixe dans l'objet
    await transporter.sendMail({
      from: `"${from_name || "ColoCrew"}" <${from_email || "contact@colocrew.com"}>`,
      to: "contact@colocrew.com",
      subject: `[COPIE ADMIN] ${subject}`,
      html,
      attachments: attachments.length ? attachments : undefined,
    });

    return Response.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("[communication/send] Erreur envoi:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
