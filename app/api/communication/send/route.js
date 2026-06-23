import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const { to, subject, html, from_name, from_email, includeDecharge } = await request.json();

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
    if (includeDecharge) {
      const dechargePath = path.join(process.cwd(), "public", "documents", "decharge-responsabilite-colocrew.pdf");
      const content = await fs.readFile(dechargePath);
      attachments.push({
        filename: "Décharge de responsabilité ColoCrew.pdf",
        content,
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
