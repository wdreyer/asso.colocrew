import nodemailer from "nodemailer";

/**
 * POST /api/send-email-reservation
 * Envoi un email admin et un email utilisateur pour une réservation.
 * L'email de confirmation comporte toutes les informations :
 * - Détails du séjour
 * - Informations de transport (ville de départ, ville de retour, frais)
 * - Détails sur les enfants (multiples)
 * - Coordonnées du responsable légal
 * - Récapitulatif du paiement incluant l'estimation
 */
export async function POST(request) {
  try {
    // Récupération des données envoyées en JSON
    const data = await request.json();
    const {
      formType, // Doit être "reservation"
      // Champs communs (pour information)
      nom,
      prenom,
      email,
      telephone,
      message,
      // Champs spécifiques à "reservation"
      reservationId,
      numeroDeReservation,
      lienAcces,
      minor,
      legal,
      options,
      payment,
      sejour,
      transport, // { departureCity, returnCity, fee }
      estimatedPriceString, // Estimation du paiement (texte)
    } = data;

    if (formType !== "reservation") {
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

    // Préparation du sujet unique pour admin et utilisateur
    const reservationSubject = `Colocrew - Confirmation de réservation No. ${
      numeroDeReservation || "???"
    }`;

    // Construction du contenu HTML unique via buildReservationEmail
    const reservationHtmlContent = buildReservationEmail({
      numeroDeReservation,
      lienAcces,
      minor,
      legal,
      options,
      payment,
      sejour,
      transport,
      estimatedPriceString,
    });

    // Options d'email pour admin et utilisateur (même contenu)
    const adminMailOptions = {
      from: `"Colocrew Réservation" <contact@colocrew.com>`,
      to: "contact@colocrew.com",
      subject: reservationSubject,
      html: reservationHtmlContent,
    };

    const userMailOptions = {
      from: `"Colocrew Réservation" <contact@colocrew.com>`,
      to: legal?.email || email || "inconnu@na.com",
      subject: reservationSubject,
      html: reservationHtmlContent,
    };

    // Envoi des emails
    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(userMailOptions);

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

/**
 * buildReservationEmail
 * Génère l'HTML final pour la confirmation de réservation.
 * La mise en forme (direction artistique) est conservée,
 * avec l'ajout des informations sur :
 * - Le séjour (Nom, tranche d'âge, dates)
 * - Le transport (ville de départ, ville de retour, frais)
 * - Les enfants (multiples)
 * - Le responsable légal
 * - Le paiement (estimation, montant total, acompte, assurance)
 */
function buildReservationEmail({
  numeroDeReservation,
  lienAcces,
  minor = {},
  legal = {},
  options = {},
  payment = {},
  sejour = {},
  transport = {},
  estimatedPriceString = "",
}) {
  const colorPrimary = "#B8336A";
  const colorSecondary = "#A2225A";

  const formatDateFR = (isoString) => {
    if (!isoString) return "Non renseignée";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Détails du séjour
  const startDate = formatDateFR(sejour?.startDate);
  const endDate = formatDateFR(sejour?.endDate);
  const sejourName = sejour?.name || sejour?.urlSejour || "Non renseigné";
  const ageGroup = sejour?.ageGroup || "Non renseignée";

  // Récupération des informations de paiement
  const paymentMethodLabel =
    options.paymentMethod === "chequeVirement"
      ? "Chèque / Virement"
      : "Carte bancaire";
  const paymentOptionLabel =
    options.paymentOption === "oneTime"
      ? "Paiement en une fois"
      : options.paymentOption === "twoTimes"
      ? "Paiement en deux fois"
      : options.paymentOption || "Inconnu";

  const insurance = payment.insuranceFee || 0;
  const nbEnfants = parseInt(minor.numberOfChildren, 10) || 1;
  let discountLabel = "";
  if (nbEnfants === 2) {
    discountLabel = "-5%";
  } else if (nbEnfants >= 3) {
    discountLabel = "-10%";
  }

  // Message de paiement selon le mode choisi
  let paymentMsg = "";
  if (options.paymentMethod === "CB") {
    paymentMsg = `
      <p style="color:${colorPrimary}; font-weight:bold;">
        Vous avez choisi le paiement par <u>carte bancaire</u>.<br/>
        Un lien de paiement vous sera envoyé dans les 24H
      </p>
    `;
  } else {
    paymentMsg = `
      <p style="color:${colorPrimary}; font-weight:bold;">
        Vous avez choisi le paiement par <u>chèque ou virement</u>.<br/>
        Le prix exact vous sera communiqué dans les 24H
        Vous disposez de 15 jours pour nous faire parvenir votre règlement.
      </p>
      <div style="margin:10px 0; padding:10px; border:1px dashed ${colorPrimary};">
        <p style="margin:0 0 5px 0;">
          <strong>Pour un paiement par chèque :</strong><br/>
          Libellez le chèque à l'ordre de <em>“Colocrew”</em> et envoyez-le à :
        </p>
        <pre style="margin:0; padding:0; font-family:inherit; font-size:14px;">
Colocrew
1 rue Magenta
93500 Pantin
        </pre>
      </div>
      <div style="margin:10px 0; padding:10px; border:1px dashed ${colorPrimary};">
        <p style="margin:0 0 5px 0;">
          <strong>Pour un paiement par virement :</strong><br/>
          IBAN :
        </p>
        <pre style="margin:0; padding:0; font-family:inherit; font-size:14px;">
FR7616958000015867806033040
        </pre>
      </div>
    `;
  }

  return `
  <div style="font-family: Arial, sans-serif; max-width:800px; margin:auto; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
    <!-- Header -->
    <div style="background: ${colorPrimary}; padding:20px; text-align:center;">
      <h1 style="color:#fff; margin:0;">Confirmation de réservation</h1>
      <p style="color:#fff; margin:5px 0;">No. ${
        numeroDeReservation || "???"
      }</p>
    </div>
    <!-- Contenu -->
    <div style="background:#fff; padding:20px;">
      <!-- Détails du séjour -->
      <h2 style="color:${colorPrimary}; margin-top:0;">Récapitulatif du séjour</h2>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Nom du séjour</td>
          <td style="border:1px solid #eee; padding:8px;">${sejourName}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Tranche d'âge</td>
          <td style="border:1px solid #eee; padding:8px;">${ageGroup}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Date de début</td>
          <td style="border:1px solid #eee; padding:8px;">${startDate}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Date de fin</td>
          <td style="border:1px solid #eee; padding:8px;">${endDate}</td>
        </tr>
      </table>

      <!-- Transport -->
      <h2 style="color:${colorPrimary}; margin-top:0;">Informations de transport</h2>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Ville de départ</td>
          <td style="border:1px solid #eee; padding:8px;">${
            transport.departureCity || "Non renseignée"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Ville de retour</td>
          <td style="border:1px solid #eee; padding:8px;">${
            transport.returnCity || "Non renseignée"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Frais de transport</td>
          <td style="border:1px solid #eee; padding:8px;">${
            transport.fee || 0
          } €</td>
        </tr>
      </table>

      <!-- Enfants -->
      <h2 style="color:${colorPrimary}; margin-top:0;">Informations des enfants</h2>
      ${
        minor && Array.isArray(minor.children) && minor.children.length
          ? minor.children
              .map(
                (child, i) => `
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Enfant ${
                i + 1
              } - Prénom</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${
                child.firstName || "Non renseigné"
              }</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Nom</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${
                child.lastName || "Non renseigné"
              }</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Date de naissance</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${
                child.birthDate || "Non renseignée"
              }</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Lieu de naissance</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${
                child.birthPlace || "Non renseigné"
              }</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Adresse</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${
                child.address || "Non renseignée"
              }, ${child.postalCode || ""} ${child.city || ""}</td>
            </tr>
          </table>
        `
              )
              .join("")
          : `<p>Aucune information sur le(s) enfant(s) n'a été fournie.</p>`
      }

      <!-- Responsable légal -->
      <h2 style="color:${colorPrimary}; margin-top:0;">Responsable légal</h2>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Prénom</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.firstName || "Non renseigné"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Nom</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.lastName || "Non renseigné"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Relation</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.relation || "Non renseignée"
          } ${legal.relationOther ? "(" + legal.relationOther + ")" : ""}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Email</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.email || "Non renseigné"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Téléphone</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.phone || "Non renseigné"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Adresse</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.address
              ? legal.address + ", " + legal.postalCode + " " + legal.city
              : "Même que le mineur"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Code promo / Parrain</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.promoCode || "Non renseigné"
          }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Numéro CAF ou Sécu</td>
          <td style="border:1px solid #eee; padding:8px;">${
            legal.cafOrSecu || "Non renseigné"
          }</td>
        </tr>       
      </table>

      <!-- Récapitulatif du paiement -->
      <h2 style="color:${colorPrimary}; margin-top:0;">Récapitulatif du paiement</h2>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
       
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Méthode de paiement</td>
          <td style="border:1px solid #eee; padding:8px;">${paymentMethodLabel}</td>
        </tr>
        <tr>

 <tr>
          <td style="border:1px solid #eee; padding:8px;">Frais de transport</td>
          <td style="border:1px solid #eee; padding:8px;">${
            transport.fee || 0
          } €</td>
        </tr>

        <tr>
          <td style="border:1px solid #eee; padding:8px; color:#16a34a;">Réduction</td>
          <td style="border:1px solid #eee; padding:8px; color:#16a34a;">${discountLabel || "N/A"}</td>
        </tr>

          <td style="border:1px solid #eee; padding:8px;">Assurance</td>
          <td style="border:1px solid #eee; padding:8px;">${insurance} €</td>
        </tr>
         <tr>
          <td style="border:1px solid #eee; padding:8px;">Estimation du prix</td>
          <td style="border:1px solid #eee; padding:8px;">${
            estimatedPriceString || "Non renseignée"
          }</td>
        </tr>
      </table>

      ${paymentMsg}

      <p style="margin:20px 0;">
        Vous pouvez gérer votre réservation (upload de documents, payer le solde, etc.) via le lien ci-dessous :
      </p>
      ${
        lienAcces
          ? `<div style="text-align:center;">
              <a href="${lienAcces}/?justCreated=true"
                 style="display:inline-block; background:${colorSecondary};
                        color:#fff; padding:12px 20px; text-decoration:none;
                        border-radius:5px; font-weight:bold;">
                Accéder à ma réservation
              </a>
            </div>`
          : `<p>Aucun lien n'est disponible pour le moment.</p>`
      }

      <p style="color:#777; font-size:0.9em; margin-top:20px;">
        Merci de votre confiance.<br/>
        L'équipe Colocrew
      </p>
    </div>
  </div>
  `;
}
