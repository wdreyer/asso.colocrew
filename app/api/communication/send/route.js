import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const { to, subject, html, from_name, from_email } = await request.json();

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

    const info = await transporter.sendMail({
      from: `"${from_name || "ColoCrew"}" <${from_email || "contact@colocrew.com"}>`,
      to,
      bcc: "contact@colocrew.com",
      subject,
      html,
    });

    return Response.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("[communication/send] Erreur envoi:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
