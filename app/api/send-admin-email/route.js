import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const { to, subject, body } = await request.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Champs manquants : to, subject, body requis" }),
        { status: 400 },
      );
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

    const htmlBody = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:#B8336A;padding:24px 32px;text-align:center;">
    <p style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 6px;">ColoCrew</p>
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">${subject}</h1>
  </div>
  <div style="padding:28px 32px;">
    ${body
      .split("\n")
      .map(line =>
        line.trim() === ""
          ? `<p style="margin:0 0 10px;">&nbsp;</p>`
          : `<p style="margin:0 0 10px;font-size:14px;color:#1e1535;line-height:1.7;">${line}</p>`,
      )
      .join("")}
  </div>
  <div style="border-top:1px solid #f0e8f5;padding:20px 32px;text-align:center;background:#fdf8fc;">
    <p style="margin:0;font-size:13px;color:#b0a0be;">À très bientôt,</p>
    <p style="margin:4px 0 0;font-size:15px;font-weight:800;color:#B8336A;">L'équipe ColoCrew</p>
  </div>
</div>`;

    await transporter.sendMail({
      from: `"ColoCrew" <contact@colocrew.com>`,
      to,
      subject,
      html: htmlBody,
      replyTo: "contact@colocrew.com",
    });

    // Copie admin
    await transporter.sendMail({
      from: `"ColoCrew Admin" <contact@colocrew.com>`,
      to: "contact@colocrew.com",
      subject: `[COPIE ADMIN] ${subject} → ${to}`,
      html: htmlBody,
    });

    return new Response(JSON.stringify({ message: "Email envoyé avec succès" }), { status: 200 });
  } catch (error) {
    console.error("Erreur envoi email admin:", error);
    return new Response(JSON.stringify({ error: "Erreur lors de l'envoi" }), { status: 500 });
  }
}
