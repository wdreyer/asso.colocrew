import nodemailer from "nodemailer";

/**
 * POST /api/send-email-admin
 * Gère les mails pour les formulaires "candidature" et "contact".
 */
export async function POST(request) {
  try {
    // Récupération des données envoyées en JSON
    const data = await request.json();
    const { formType, nom, prenom, email, telephone, message } = data;

    // On ne traite que les types "candidature" et "contact"
    if (formType !== "candidature" && formType !== "contact") {
      return new Response(
        JSON.stringify({ error: "formType non valide pour cet endpoint" }),
        { status: 400 }
      );
    }

    // Configuration du transporteur SMTP (Sendinblue / Brevo)
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.sendinblue.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.NEXT_USER_MAIL,
        pass: process.env.NEXT_USER_PASSWORD,
      },
    });

    let subject = "";
    let htmlContent = "";

    if (formType === "candidature") {
      subject = "Nouvelle candidature";
      htmlContent = `
        <h1>Nouvelle candidature</h1>
        <p><strong>Nom :</strong> ${nom}</p>
        <p><strong>Prénom :</strong> ${prenom}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${telephone}</p>
        <p><strong>Message de motivation :</strong><br/>${message}</p>
      `;
    } else if (formType === "contact") {
      subject = "Nouveau message de contact";
      htmlContent = `
        <h1>Nouveau message de contact</h1>
        <p><strong>Nom :</strong> ${nom}</p>
        <p><strong>Prénom :</strong> ${prenom}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${telephone}</p>
        <p><strong>Message :</strong><br/>${message}</p>
      `;
    }

    const mailOptions = {
      from: `"Colocrew Contact" <contact@colocrew.com>`,
      to: "contact@colocrew.com",
      subject,
      html: htmlContent,
    };

    // Envoi de l'e-mail admin
    await transporter.sendMail(mailOptions);

    return new Response(
      JSON.stringify({ message: "Email envoyé avec succès" }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email:", error);
    return new Response(
      JSON.stringify({ error: "Erreur lors de l'envoi de l'email" }),
      { status: 500 }
    );
  }
}
