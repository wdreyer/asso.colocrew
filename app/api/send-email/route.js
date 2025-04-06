import nodemailer from "nodemailer";

/**
 * POST /api/send-email
 * En fonction de formType, on envoie différents mails :
 *  - "candidature"  => mail admin
 *  - "contact"      => mail admin
 *  - "reservation"  => mail admin + mail user stylé
 */
export async function POST(request) {
  try {
    // On récupère tous les champs envoyés en JSON
    const data = await request.json();
    const {
      formType, // "candidature" | "contact" | "reservation"

      // Champs communs
      nom,
      prenom,
      email,
      telephone,
      message,

      // Champs pour "reservation"
      reservationId,
      numeroDeReservation,
      lienAcces,

      // Pour "reservation" : mineur, legal, options, payment, sejour
      // Pour la partie mineur, nous vérifions si un tableau "children" est fourni
      minor,
      legal,
      options,
      payment,
      sejour,
    } = data;

    // 1) Configurer le transporteur SMTP (Sendinblue / Brevo)
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.sendinblue.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.NEXT_USER_MAIL,
        pass: process.env.NEXT_USER_PASSWORD,
      },
      tls: {
        // Si vous rencontrez des problèmes de certificat, décommentez la ligne suivante
        // rejectUnauthorized: false,
      },
    });

    // Optionnel : Vérifier la connexion (pour le debug)
    // await transporter.verify();

    // Variables pour l'e-mail "admin"
    let adminSubject = "";
    let adminHtmlContent = "";

    // Variables pour l'e-mail "user"
    let userSubject = "";
    let userHtmlContent = "";
    let userMailOptions = null;

    // 2) On gère formType
    if (formType === "candidature") {
      adminSubject = "Nouvelle candidature";
      adminHtmlContent = `
        <h1>Nouvelle candidature</h1>
        <p><strong>Nom :</strong> ${nom}</p>
        <p><strong>Prénom :</strong> ${prenom}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${telephone}</p>
        <p><strong>Message de motivation :</strong><br/>${message}</p>
      `;
    } else if (formType === "contact") {
      adminSubject = "Nouveau message de contact";
      adminHtmlContent = `
        <h1>Nouveau message de contact</h1>
        <p><strong>Nom :</strong> ${nom}</p>
        <p><strong>Prénom :</strong> ${prenom}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${telephone}</p>
        <p><strong>Message :</strong><br/>${message}</p>
      `;
    } else if (formType === "reservation") {
      // (1) Email Admin enrichi

      adminSubject = `Nouvelle réservation No. ${numeroDeReservation || "???"}`;
      adminHtmlContent = `
        <h1 style="color:#B8336A;">Nouvelle réservation</h1>
        <p><strong>Numéro de réservation :</strong> ${numeroDeReservation || "???"}</p>
        <p><strong>Réservation ID :</strong> ${reservationId || "???"}</p>
        <p><strong>Lien d'accès éventuel :</strong> ${lienAcces || "N/A"}</p>
        <hr/>
        <h2>Informations des enfants</h2>
        ${
          minor && Array.isArray(minor.children) && minor.children.length
            ? minor.children
                .map(
                  (child, i) => `
            <p>
              <strong>Enfant ${i + 1} :</strong> ${child.firstName} ${child.lastName}, né(e) le ${child.birthDate}, 
              Lieu de naissance : ${child.birthPlace || "Non renseigné"}, 
              Adresse : ${child.address}, ${child.postalCode} ${child.city}
            </p>
          `
                )
                .join("")
            : `<p><strong>Mineur :</strong> ${minor.firstName || ""} ${minor.lastName || ""}, né(e) le ${minor.birthDate || ""}, 
                  Lieu de naissance : ${minor.birthPlace || "Non renseigné"}, 
                  Adresse : ${minor.address || ""}, ${minor.postalCode || ""} ${minor.city || ""}</p>`
        }
        <hr/>
        <h2>Informations du responsable légal</h2>
        <p><strong>Nom :</strong> ${legal.firstName || ""} ${legal.lastName || ""}</p>
        <p><strong>Relation :</strong> ${legal.relation || ""} ${
        legal.relationOther ? "(" + legal.relationOther + ")" : ""
      }</p>
        <p><strong>Email :</strong> ${legal.email || ""}</p>
        <p><strong>Téléphone :</strong> ${legal.phone || ""}</p>
        <p><strong>Adresse :</strong> ${
          legal.address
            ? legal.address + ", " + legal.postalCode + " " + legal.city
            : "Même que le mineur"
        }</p>
        <p><strong>Code promo / Parrain :</strong> ${legal.promoCode || "Non renseigné"}</p>
        <p><strong>Numéro CAF ou Sécu :</strong> ${legal.cafOrSecu || "Non renseigné"}</p>
        <p><strong>Justificatif :</strong> ${
          legal.justificatif ? legal.justificatif.name : "Aucun"
        }</p>
        <hr/>
        <h2>Récapitulatif du paiement</h2>
        <p><strong>Méthode de paiement :</strong> ${
          options.paymentMethod === "chequeVirement" ? "Chèque / Virement" : "Carte bancaire"
        }</p>
        <p><strong>Option de paiement :</strong> ${
          options.paymentOption === "oneTime"
            ? "Paiement en une fois"
            : options.paymentOption === "twoTimes"
            ? "Paiement en deux fois"
            : options.paymentOption || "Inconnu"
        }</p>
        <p><strong>Montant total :</strong> ${payment.basePrice || 0} €</p>
        <p><strong>Acompte :</strong> ${payment.depositValue || 0} €</p>
        <p><strong>Assurance :</strong> ${payment.insuranceFee || 0} €</p>
      `;

      // (2) Email Utilisateur stylé
      userSubject = `Colocrew - Confirmation de réservation No. ${numeroDeReservation || "???"}`;
      userHtmlContent = buildReservationEmail({
        numeroDeReservation,
        lienAcces,
        minor,
        legal,
        options,
        payment,
        sejour,
      });
      userMailOptions = {
        from: `"Colocrew Réservation" <contact@colocrew.com>`,
        to: legal?.email || email || "inconnu@na.com",
        subject: userSubject,
        html: userHtmlContent,
      };
    } else {
      return new Response(
        JSON.stringify({ error: "Données invalides ou formType non reconnu" }),
        { status: 400 }
      );
    }

    // 3) Configurer l'e-mail admin (on ne modifie pas ce qui existe déjà)
    const adminMailOptions = {
      from: `"Colocrew Réservation" <contact@colocrew.com>`,
      to: "contact@colocrew.com",
      subject: adminSubject,
      html: adminHtmlContent,
    };

    // 4) Envoi des mails
    // (a) Envoyer l'email admin
    await transporter.sendMail(adminMailOptions);
    // (b) Si c'est une réservation, envoyer l'email utilisateur
    if (formType === "reservation" && userMailOptions) {
      await transporter.sendMail(userMailOptions);
    }

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
 * buildReservationEmail : génère l'HTML final pour la "reservation"
 * Couleurs : #B8336A, #A2225A
 * Récapitulatif : Séjour (dates, tranche d'âge), Informations des enfants, Responsable légal, Paiement et lien d'accès.
 */
function buildReservationEmail({
  numeroDeReservation,
  lienAcces,
  minor = {},
  legal = {},
  options = {},
  payment = {},
  sejour = {},
}) {
  // Couleurs
  const colorPrimary = "#B8336A";
  const colorSecondary = "#A2225A";

  // Format des dates en français
  const formatDateFR = (isoString) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const startDate = formatDateFR(sejour?.startDate);
  const endDate = formatDateFR(sejour?.endDate);
  const ageGroup = sejour?.ageGroup || "";

  // Traduction des options de paiement
  const paymentMethodLabel = options.paymentMethod === "chequeVirement" ? "Chèque / Virement" : "Carte bancaire";
  const paymentOptionLabel =
    options.paymentOption === "oneTime"
      ? "Paiement en une fois"
      : options.paymentOption === "twoTimes"
      ? "Paiement en deux fois"
      : options.paymentOption || "Inconnu";
  const total = payment.basePrice || 0;
  const deposit = payment.depositValue || 0;
  const insurance = payment.insuranceFee || 0;

  // Message spécifique selon la méthode de paiement
  let paymentMsg = "";
  if (options.paymentMethod === "CB") {
    paymentMsg = `
      <p style="color:${colorPrimary}; font-weight:bold;">
        Vous avez choisi le paiement par <u>carte bancaire</u>.<br/>
        Un email de confirmation Stripe vous sera envoyé sous peu.
      </p>
    `;
  } else {
    paymentMsg = `
      <p style="color:${colorPrimary}; font-weight:bold;">
        Vous avez choisi le paiement par <u>chèque ou virement</u>.<br/>
        Vous disposez de 15 jours pour nous faire parvenir votre règlement.
      </p>
      <div style="margin:10px 0; padding:10px; border:1px dashed ${colorPrimary};">
        <p style="margin:0 0 5px 0;">
          <strong>Pour un paiement par chèque :</strong><br/>
          Libeller le chèque à l'ordre de <em>“Colocrew”</em> et l'envoyer à :
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
      <p style="color:#fff; margin:5px 0;">No. ${numeroDeReservation || "???"}</p>
    </div>
    <!-- Contenu -->
    <div style="background:#fff; padding:20px;">
      <h2 style="color:${colorPrimary}; margin-top:0;">Récapitulatif du séjour</h2>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Séjour</td>
          <td style="border:1px solid #eee; padding:8px;">${sejour.urlSejour || "Inconnu"}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Date de début</td>
          <td style="border:1px solid #eee; padding:8px;">${startDate || "Non renseignée"}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Date de fin</td>
          <td style="border:1px solid #eee; padding:8px;">${endDate || "Non renseignée"}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Tranche d'âge</td>
          <td style="border:1px solid #eee; padding:8px;">${ageGroup || "Non renseignée"}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Ville de départ</td>
          <td style="border:1px solid #eee; padding:8px;">${sejour.urlCity || "Sur place"}</td>
        </tr>
      </table>

      <h2 style="color:${colorPrimary}; margin-top:0;">Informations des enfants</h2>
      ${
        minor && Array.isArray(minor.children) && minor.children.length
          ? minor.children
              .map(
                (child, i) => `
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Enfant ${i + 1} - Prénom</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${child.firstName || ""}</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Nom</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${child.lastName || ""}</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Date de naissance</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${child.birthDate || ""}</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Lieu de naissance</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${child.birthPlace || "Non renseigné"}</td>
            </tr>
            <tr>
              <td style="border:1px solid #eee; padding:8px;"><strong>Adresse</strong></td>
              <td style="border:1px solid #eee; padding:8px;">${child.address}, ${child.postalCode} ${child.city}</td>
            </tr>
          </table>
        `
              )
              .join("")
          : `<p><strong>Mineur :</strong> ${minor.firstName || ""} ${minor.lastName || ""}, né(e) le ${minor.birthDate || ""}, 
                Lieu de naissance : ${minor.birthPlace || "Non renseigné"}, 
                Adresse : ${minor.address || ""}, ${minor.postalCode || ""} ${minor.city || ""}</p>`
      }

      <h2 style="color:${colorPrimary}; margin-top:0;">Responsable légal</h2>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Prénom</td>
          <td style="border:1px solid #eee; padding:8px;">${legal.firstName || ""}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Nom</td>
          <td style="border:1px solid #eee; padding:8px;">${legal.lastName || ""}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Relation</td>
          <td style="border:1px solid #eee; padding:8px;">${legal.relation || ""} ${
    legal.relationOther ? "(" + legal.relationOther + ")" : ""
  }</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Email</td>
          <td style="border:1px solid #eee; padding:8px;">${legal.email || ""}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Téléphone</td>
          <td style="border:1px solid #eee; padding:8px;">${legal.phone || ""}</td>
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
          <td style="border:1px solid #eee; padding:8px;">${legal.promoCode || "Non renseigné"}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Numéro CAF ou Sécu</td>
          <td style="border:1px solid #eee; padding:8px;">${legal.cafOrSecu || "Non renseigné"}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Justificatif</td>
          <td style="border:1px solid #eee; padding:8px;">${legal.justificatif ? legal.justificatif.name : "Aucun"}</td>
        </tr>
      </table>

      <h2 style="color:${colorPrimary}; margin-top:0;">Récapitulatif du paiement</h2>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Méthode</td>
          <td style="border:1px solid #eee; padding:8px;">${paymentMethodLabel}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Option</td>
          <td style="border:1px solid #eee; padding:8px;">${paymentOptionLabel}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Montant total</td>
          <td style="border:1px solid #eee; padding:8px;">${total} €</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Acompte</td>
          <td style="border:1px solid #eee; padding:8px;">${deposit} €</td>
        </tr>
        <tr>
          <td style="border:1px solid #eee; padding:8px;">Assurance</td>
          <td style="border:1px solid #eee; padding:8px;">${insurance} €</td>
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
