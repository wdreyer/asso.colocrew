// app/api/send-email/route.js
import nodemailer from 'nodemailer';

export async function POST(request) {
  const {
    nom,
    prenom,
    email,
    telephone,
    message,
    selectedDate,
    selectedCity,
    reservationPrice,
    formType, // Ajout du champ formType pour distinguer les formulaires
  } = await request.json();

  // Configurer le transporteur SMTP
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: '7d6e72001@smtp-brevo.com',
      pass: process.env.SENDINBLUE_SMTP_PASSWORD,
    },
  });

  let subject = '';
  let htmlContent = '';

  if (formType === 'candidature') {
    // Cas de la candidature
    subject = 'Nouvelle candidature';
    htmlContent = `
      <h1>Nouvelle candidature</h1>
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Prénom :</strong> ${prenom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone}</p>
      <p><strong>Message de motivation :</strong><br/>${message}</p>
    `;
  } else if (selectedDate && selectedCity && reservationPrice) {
    // Cas de la réservation
    subject = 'Nouvelle réservation';
    htmlContent = `
      <h1>Nouvelle réservation</h1>
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Prénom :</strong> ${prenom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone}</p>
      <p><strong>Date sélectionnée :</strong> ${selectedDate}</p>
      <p><strong>Ville de départ :</strong> ${selectedCity}</p>
      <p><strong>Prix total :</strong> ${reservationPrice} €</p>
    `;
  } else if (message) {
    // Cas du message de contact
    subject = 'Nouveau message de contact';
    htmlContent = `
      <h1>Nouveau message de contact</h1>
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Prénom :</strong> ${prenom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone}</p>
      <p><strong>Message :</strong> ${message}</p>
    `;
  } else {
    return new Response(JSON.stringify({ error: 'Données invalides' }), { status: 400 });
  }

  // Contenu de l'e-mail
  const mailOptions = {
    from: `"Site Web" <contact@colocrew.com>`,
    to: 'contact@colocrew.com',
    subject: subject,
    html: htmlContent,
  };

  try {
    // Envoyer l'e-mail
    await transporter.sendMail(mailOptions);
    return new Response(
      JSON.stringify({ message: 'Email envoyé avec succès' }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    return new Response(
      JSON.stringify({ error: 'Erreur lors de l\'envoi de l\'email' }),
      { status: 500 }
    );
  }
}
