import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const { to, subject, body, bodyHtml, attachment, includeDecharge } = await request.json();

    if (!to || !subject || (!body && !bodyHtml)) {
      return new Response(
        JSON.stringify({ error: "Champs manquants : to, subject, body ou bodyHtml requis" }),
        { status: 400 },
      );
    }

    const attachments = [];
    if (attachment?.contentBase64) {
      const content = Buffer.from(attachment.contentBase64, "base64");
      if (content.length > 8 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "Pièce jointe trop volumineuse (8 Mo maximum)" }), { status: 413 });
      }
      attachments.push({
        filename: String(attachment.filename || "document.pdf").replace(/[^\w.\-À-ÿ]/g, "-"),
        content,
        contentType: attachment.contentType || "application/pdf",
      });
    }

    if (includeDecharge) {
      const dechargePath = path.join(process.cwd(), "public", "documents", "decharge-responsabilite-colocrew.pdf");
      const content = await fs.readFile(dechargePath);
      attachments.push({
        filename: "Décharge de responsabilité ColoCrew.pdf",
        content,
        contentType: "application/pdf",
      });
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

    const urlLineRegex = /^https?:\/\/\S+$/;

    const htmlBody = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:#B8336A;padding:24px 32px;text-align:center;">
    <p style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 6px;">ColoCrew</p>
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">${subject}</h1>
  </div>
  <div style="padding:28px 32px;">
    ${bodyHtml || body
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (urlLineRegex.test(trimmed)) {
          return `<div style="text-align:center;margin:8px 0 18px;">
            <a href="${trimmed}" style="display:inline-block;background:#B8336A;color:#fff;padding:14px 32px;text-decoration:none;border-radius:100px;font-weight:700;font-size:14px;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(184,51,106,0.35);">Procéder au paiement →</a>
          </div>`;
        }
        return trimmed === ""
          ? `<p style="margin:0 0 10px;">&nbsp;</p>`
          : `<p style="margin:0 0 10px;font-size:14px;color:#1e1535;line-height:1.7;">${line}</p>`;
      })
      .join("")}
  </div>
  <div style="border-top:1px solid #f0e8f5;padding:20px 32px;text-align:center;background:#fdf8fc;">
    <p style="margin:0;font-size:13px;color:#b0a0be;">À très bientôt,</p>
    <p style="margin:4px 0 0;font-size:15px;font-weight:800;color:#B8336A;">L'équipe ColoCrew</p>
  </div>
</div>`;

    const mailAttachments = attachments.length ? attachments : undefined;

    await transporter.sendMail({
      from: `"ColoCrew" <contact@colocrew.com>`,
      to,
      subject,
      html: htmlBody,
      replyTo: "contact@colocrew.com",
      attachments: mailAttachments,
    });

    await transporter.sendMail({
      from: `"ColoCrew Admin" <contact@colocrew.com>`,
      to: "contact@colocrew.com",
      subject: `[COPIE ADMIN] ${subject} → ${to}`,
      html: htmlBody,
      attachments: mailAttachments,
    });

    return new Response(JSON.stringify({ message: "Email envoyé avec succès" }), { status: 200 });
  } catch (error) {
    console.error("Erreur envoi email admin:", error);
    return new Response(JSON.stringify({ error: "Erreur lors de l'envoi" }), { status: 500 });
  }
}
