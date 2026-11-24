import nodemailer from "nodemailer";
import { unsubscribeHeaders, withUnsubscribeLink } from "@/src/lib/unsubscribe";

export async function POST(request) {
  const { to, sender, subject, htmlContent, replyTo } = await request.json();

  if (!to || !sender?.email || !subject || !htmlContent) {
    return Response.json({ error: "Paramètres manquants" }, { status: 400 });
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

  try {
    await transporter.sendMail({
      from:    `"${sender.name}" <${sender.email}>`,
      to,
      replyTo: replyTo || sender.email,
      subject: `[TEST] ${subject}`,
      headers: unsubscribeHeaders(to),
      html:    withUnsubscribeLink(htmlContent, to).replace(/\{\{params\.PRENOM\}\}/gi, "Prénom").replace(/\{\{params\.NOM\}\}/gi, "Nom"),
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
