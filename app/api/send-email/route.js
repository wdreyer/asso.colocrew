import nodemailer from "nodemailer";

export async function POST(request) {
  // On récupère tous les champs du body
  const {
    nom,
    prenom,
    email,
    telephone,
    message,
    selectedDate,
    selectedCity,
    reservationPrice,
    lienAcces, // lien unique pour gérer la réservation
    formType,  // distingue les types de formulaires : "candidature", "contact", "reservation", etc.
  } = await request.json();

  // 1) Configurer le transporteur SMTP (Brevo/Sendinblue)
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 587,
    secure: false, // STARTTLS
    auth: {
      user: process.env.NEXT_USER_MAIL, // Ton identifiant
      pass: process.env.NEXT_USER_PASSWOR,        // Ton mot de passe
    },
  });

  // Variables qui vont contenir `subject` et `htmlContent` pour l'email admin
  let adminSubject = "";
  let adminHtmlContent = "";

  // Variables pour l'email utilisateur (optionnel)
  let userSubject = "";
  let userHtmlContent = "";
  let userMailOptions = null; // On construira cet objet si on veut envoyer un mail user

  // 2) Selon formType, on construit le contenu
  if (formType === "candidature") {
    // ----------------- Candidature -----------------
    adminSubject = "Nouvelle candidature";
    adminHtmlContent = `
      <h1>Nouvelle candidature</h1>
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Prénom :</strong> ${prenom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone}</p>
      <p><strong>Message de motivation :</strong><br/>${message}</p>
    `;
    // Pas d'email utilisateur, ou alors tu peux en créer un.

  } else if (formType === "contact") {
    // ----------------- Contact -----------------
    adminSubject = "Nouveau message de contact";
    adminHtmlContent = `
      <h1>Nouveau message de contact</h1>
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Prénom :</strong> ${prenom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone}</p>
      <p><strong>Message :</strong> ${message}</p>
    `;
    // Pas d'email utilisateur, sauf si tu veux accuser réception.

  } else if (formType === "reservation" && selectedDate && selectedCity && reservationPrice) {
    // ----------------- Réservation -----------------
    // (1) Email Admin
    adminSubject = "Nouvelle réservation";
    adminHtmlContent = `
      <h1>Nouvelle réservation</h1>
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Prénom :</strong> ${prenom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone}</p>
      <p><strong>Date :</strong> ${selectedDate}</p>
      <p><strong>Ville de départ :</strong> ${selectedCity}</p>
      <p><strong>Prix total :</strong> ${reservationPrice} €</p>
    `;

    // (2) Email utilisateur
    userSubject = "Votre réservation pour votre séjour Colocrew a bien été enregistrée !";
    userHtmlContent = `
      <div style="font-family: Arial, sans-serif; margin: 20px; padding: 20px; border: 1px solid #ddd;">
        <h1 style="color: #333;">Merci pour votre réservation, ${prenom} !</h1>
        <p>Voici un récapitulatif :</p>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Nom :</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${nom}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Prénom :</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${prenom}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Email :</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${email}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Téléphone :</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${telephone}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Date sélectionnée :</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${selectedDate}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Ville de départ :</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${selectedCity}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Prix total :</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${reservationPrice} €</td>
          </tr>
        </table>

        <p style="margin-bottom: 20px;">
          Pour gérer votre réservation (modifier des infos, payer le solde, etc.),
          cliquez sur le lien ci-dessous :
        </p>
        ${
          lienAcces
            ? `<p style="text-align: center;">
                <a 
                  href="${lienAcces}" 
                  style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: #fff; text-decoration: none; border-radius: 5px;"
                >
                  Accéder à ma réservation
                </a>
              </p>`
            : "<p>Aucun lien n'est disponible pour le moment.</p>"
        }

        <p style="margin-top: 30px; color: #777; font-size: 0.9em;">
          Si vous avez des questions, n'hésitez pas à nous contacter.
        </p>
      </div>
    `;

    // Créer l'objet userMailOptions
    userMailOptions = {
      from: `"Colocrew Réservation" <contact@colocrew.com>`,
      to: email, 
      subject: userSubject,
      html: userHtmlContent,
    };
  } else {
    // Cas message non reconnu ou données incomplètes
    return new Response(
      JSON.stringify({ error: "Données invalides ou formType non reconnu" }),
      { status: 400 }
    );
  }

  // 4) Configurer l'email admin
  const adminMailOptions = {
    from: `"Colocrew Réservation" <contact@colocrew.com>`,
    to: "contact@colocrew.com",
    subject: adminSubject,
    html: adminHtmlContent,
  };

  try {
    // 1) Envoyer l'e-mail admin
    await transporter.sendMail(adminMailOptions);

    // 2) Si c'est une réservation, on envoie également un e-mail user
    if (formType === "reservation") {
      // On suppose que 'userMailOptions' a été construit
      if (userMailOptions) {
        await transporter.sendMail(userMailOptions);
      }
    }

    // 3) Tout est OK
    return new Response(
      JSON.stringify({ message: "Emails envoyés avec succès" }),
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
