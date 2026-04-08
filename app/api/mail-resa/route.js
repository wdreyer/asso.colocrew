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
    const reservationSubject = `Colocrew - Estimation de tarif No. ${
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
      from: `"ColoCrew" <contact@colocrew.com>`,
      to: "contact@colocrew.com",
      subject: reservationSubject,
      html: reservationHtmlContent,
    };

    const userMailOptions = {
      from: `"ColoCrew" <contact@colocrew.com>`,
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

  // Paiement
  const paymentMethodLabel =
    options.paymentMethod === "chequeVirement"
      ? "Chèque / Virement"
      : "Carte bancaire";

  const insurance = payment.insuranceFee || 0;
  const estimatedMin = Number(payment?.estimatedPriceMin || 0);
  const estimatedMax = Number(payment?.estimatedPriceMax || 0);
  const estimatedRangeLabel =
    estimatedMin > 0 || estimatedMax > 0
      ? estimatedMin === estimatedMax
        ? `${estimatedMin} €`
        : `${estimatedMin} - ${estimatedMax} €`
      : "";
  const nbEnfants = parseInt(minor.numberOfChildren, 10) || 1;
  let discountLabel = "";
  if (nbEnfants === 2) discountLabel = "-5%";
  else if (nbEnfants >= 3) discountLabel = "-10%";

  // Bloc message
  const messageBlock =
    legal.message && legal.message.trim()
      ? `
      <!-- Message -->
      <h2 style="color:${colorPrimary}; margin-top:0;">Message et questions</h2>
      <p style="margin-bottom:20px;">${legal.message}</p>
    `
      : "";

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
        Le prix exact vous sera communiqué dans les 24H.<br/>
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

  // Helper : génère une ligne label/valeur avec fond alterné
  const r = (label, value, idx = 0) => `
    <tr style="background:${idx % 2 === 0 ? "#fafafa" : "#fff"};">
      <td style="padding:10px 14px; font-size:13px; color:#888; font-weight:600; width:38%; vertical-align:top;">${label}</td>
      <td style="padding:10px 14px; font-size:13px; color:#1e1040; font-weight:500; vertical-align:top;">${value || "<span style='color:#ccc'>—</span>"}</td>
    </tr>`;

  const section = (title) => `
    <tr><td colspan="2" style="padding:20px 14px 6px; font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:${colorPrimary}; border-top:2px solid #f3eef8;">${title}</td></tr>`;

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width:620px; margin:auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:${colorPrimary}; padding:28px 32px; text-align:center;">
      <p style="color:rgba(255,255,255,0.7); font-size:11px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; margin:0 0 8px;">ColoCrew · Été 2026</p>
      <h1 style="color:#fff; margin:0 0 6px; font-size:24px; font-weight:800; letter-spacing:-0.01em;">Estimation de tarif</h1>
      <p style="color:rgba(255,255,255,0.85); margin:0; font-size:14px; font-weight:600;">N° ${numeroDeReservation || "???"}</p>
    </div>

    <!-- Bandeau info -->
    <div style="background:#fdf3f7; border-bottom:1px solid #f3e6ef; padding:14px 32px; text-align:center;">
      <p style="margin:0; font-size:13px; color:#9b4c6e; font-weight:600;">
        ✉️ Notre équipe vous contacte dans les <strong>24h</strong> pour finaliser votre inscription.
      </p>
    </div>

    <!-- Corps -->
    <div style="padding:8px 24px 32px;">
      <table style="width:100%; border-collapse:collapse;">

        ${section("Séjour")}
        ${r("Nom du séjour", sejourName, 0)}
        ${r("Tranche d'âge", ageGroup, 1)}
        ${r("Date de début", startDate, 2)}
        ${r("Date de fin", endDate, 3)}

        ${section("Transport")}
        ${r("Ville de départ", transport.departureCity || "—", 0)}
        ${r("Ville de retour", transport.returnCity || "—", 1)}
        ${r("Frais de transport", transport.fee ? `${transport.fee} €` : "Inclus", 2)}

        ${section("Enfant(s)")}
        ${
          minor && Array.isArray(minor.children) && minor.children.length
            ? minor.children.map((child, i) => [
                r(`Enfant ${i + 1}`, `${child.firstName || ""} ${child.lastName || ""}`, i * 5),
                r("Date de naissance", child.birthDate || "—", i * 5 + 1),
                r("Lieu de naissance", child.birthPlace || "—", i * 5 + 2),
                r("Adresse", child.address ? `${child.address}, ${child.postalCode || ""} ${child.city || ""}` : "—", i * 5 + 3),
              ].join("")).join("")
            : r("Enfants", "Aucune information fournie", 0)
        }

        ${section("Responsable légal")}
        ${r("Nom", `${legal.firstName || ""} ${legal.lastName || ""}`, 0)}
        ${r("Relation", `${legal.relation || ""}${legal.relationOther ? " (" + legal.relationOther + ")" : ""}`, 1)}
        ${r("Email", legal.email || "—", 2)}
        ${r("Téléphone", legal.phone || "—", 3)}
        ${r("Adresse", legal.address ? `${legal.address}, ${legal.postalCode || ""} ${legal.city || ""}` : "Même que le mineur", 4)}
        ${r("N° Allocataire CAF", legal.cafOrSecu || "—", 5)}
        ${r("Quotient familial (QF)", legal.qf || "—", 6)}
        ${r("Code promo", legal.promoCode || "—", 7)}
        ${legal.justificatifUrl ? r("Justificatif", `<a href="${legal.justificatifUrl}" style="color:${colorPrimary};">Télécharger</a>`, 8) : ""}

        ${legal.message ? `${section("Message")}${r("", legal.message, 0)}` : ""}

        ${section("Estimation tarifaire")}
        ${r("Méthode de paiement", paymentMethodLabel, 0)}
        ${r("Frais de transport", `${transport.fee || 0} €`, 1)}
        ${discountLabel ? r("Réduction fratrie", `<span style='color:#16a34a;font-weight:700;'>${discountLabel}</span>`, 2) : ""}
        ${insurance ? r("Assurance", `${insurance} €`, 3) : ""}
        ${r("Estimation du prix", `<strong style='color:${colorPrimary};font-size:15px;'>${estimatedPriceString || estimatedRangeLabel || "—"}</strong>`, 4)}

      </table>

      ${paymentMsg ? `<div style="margin:20px 0; padding:16px; background:#fdf3f7; border-radius:8px; border-left:3px solid ${colorPrimary}; font-size:13px;">${paymentMsg}</div>` : ""}

      <p style="margin:20px 0 0; color:#666; font-size:13px; line-height:1.7; background:#f9f9f9; padding:14px 16px; border-radius:8px;">
        Cette estimation est <strong>indicative</strong>. Notre équipe vous contactera dans les <strong>24h</strong> pour confirmer les détails et vous accompagner dans la suite de votre inscription.
      </p>

      ${lienAcces ? `
      <div style="text-align:center; margin:28px 0 12px;">
        <a href="${lienAcces}?justCreated=true"
           style="display:inline-block; background:${colorPrimary}; color:#fff; padding:14px 32px;
                  text-decoration:none; border-radius:100px; font-weight:700; font-size:14px;
                  letter-spacing:0.02em; box-shadow:0 4px 14px rgba(184,51,106,0.35);">
          Voir le détail de ma demande →
        </a>
      </div>` : ""}
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #f0e8f5; padding:20px 32px; text-align:center; background:#fdf8fc;">
      <p style="margin:0; font-size:13px; color:#b0a0be;">À très bientôt,</p>
      <p style="margin:4px 0 0; font-size:15px; font-weight:800; color:${colorPrimary};">L'équipe ColoCrew</p>
    </div>

  </div>
  `;
}
