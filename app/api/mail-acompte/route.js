import nodemailer from "nodemailer";

export async function POST(request) {
  try {
    const {
      numeroDeReservation,
      lienAcces,
      clientEmail,
      clientFirstName,
      clientLastName,
      sejourName,
      startDate,
      endDate,
      ageGroup,
      amountPaid = 100,
    } = await request.json();

    const transporter = nodemailer.createTransport({
      host: "smtp-relay.sendinblue.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.NEXT_USER_MAIL,
        pass: process.env.NEXT_USER_PASSWORD,
      },
    });

    const colorPrimary = "#B8336A";

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

    const startDateFR = formatDateFR(startDate);
    const endDateFR = formatDateFR(endDate);

    // ─── Email CLIENT ───────────────────────────────────────────────────────
    const clientHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

      <div style="background:${colorPrimary};padding:28px 32px;text-align:center;">
        <p style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 8px;">ColoCrew · Été 2026</p>
        <h1 style="color:#fff;margin:0 0 6px;font-size:24px;font-weight:800;">✅ Votre place est bloquée !</h1>
        <p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px;font-weight:600;">N° ${numeroDeReservation}</p>
      </div>

      <div style="padding:28px 32px;">
        <p style="font-size:15px;color:#1e1040;margin:0 0 16px;">Bonjour ${clientFirstName},</p>
        <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 20px;">
          Nous avons bien reçu votre acompte de <strong style="color:${colorPrimary};">${amountPaid}€</strong>.
          Votre place pour le séjour <strong>${sejourName}</strong> (${ageGroup})
          du <strong>${startDateFR}</strong> au <strong>${endDateFR}</strong> est désormais <strong>bloquée</strong>.
        </p>

        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
          <p style="margin:0;font-size:14px;color:#16a34a;font-weight:700;">🎉 Acompte de ${amountPaid}€ reçu avec succès</p>
          <p style="margin:6px 0 0;font-size:13px;color:#15803d;">Cet acompte sera déduit de votre montant total.</p>
        </div>

        <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 24px;">
          Notre équipe va calculer le prix exact de votre séjour et vous contacter dans les <strong>24h</strong>
          pour vous communiquer le solde restant à régler.
        </p>

        ${lienAcces ? `
        <div style="text-align:center;margin:0 0 12px;">
          <a href="${lienAcces}"
             style="display:inline-block;background:${colorPrimary};color:#fff;padding:14px 32px;text-decoration:none;border-radius:100px;font-weight:700;font-size:14px;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(184,51,106,0.35);">
            Voir le détail de ma réservation →
          </a>
        </div>` : ""}
      </div>

      <div style="border-top:1px solid #f0e8f5;padding:20px 32px;text-align:center;background:#fdf8fc;">
        <p style="margin:0;font-size:13px;color:#b0a0be;">À très bientôt,</p>
        <p style="margin:4px 0 0;font-size:15px;font-weight:800;color:${colorPrimary};">L'équipe ColoCrew</p>
      </div>
    </div>`;

    // ─── Email ADMIN ────────────────────────────────────────────────────────
    const adminHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

      <div style="background:#1e1040;padding:24px 32px;text-align:center;">
        <h1 style="color:#fff;margin:0 0 6px;font-size:22px;font-weight:800;">✅ Acompte reçu — Action requise</h1>
        <p style="color:rgba(255,255,255,0.7);margin:0;font-size:14px;">N° ${numeroDeReservation}</p>
      </div>

      <div style="padding:24px 32px;">
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
          <p style="margin:0;font-size:15px;color:#16a34a;font-weight:700;">
            💰 ${clientFirstName} ${clientLastName} a payé ${amountPaid}€ d'acompte
          </p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#fafafa;">
            <td style="padding:10px 14px;color:#888;font-weight:600;width:38%;">Client</td>
            <td style="padding:10px 14px;color:#1e1040;font-weight:500;">${clientFirstName} ${clientLastName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#888;font-weight:600;">Email</td>
            <td style="padding:10px 14px;color:#1e1040;font-weight:500;">${clientEmail}</td>
          </tr>
          <tr style="background:#fafafa;">
            <td style="padding:10px 14px;color:#888;font-weight:600;">Séjour</td>
            <td style="padding:10px 14px;color:#1e1040;font-weight:500;">${sejourName} (${ageGroup})</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#888;font-weight:600;">Dates</td>
            <td style="padding:10px 14px;color:#1e1040;font-weight:500;">${startDateFR} → ${endDateFR}</td>
          </tr>
          <tr style="background:#fafafa;">
            <td style="padding:10px 14px;color:#888;font-weight:600;">Acompte reçu</td>
            <td style="padding:10px 14px;color:#16a34a;font-weight:700;">${amountPaid}€</td>
          </tr>
        </table>

        <div style="margin:20px 0 0;padding:16px 20px;background:#fff3f8;border-left:3px solid ${colorPrimary};border-radius:4px;">
          <p style="margin:0;font-size:14px;color:${colorPrimary};font-weight:700;">⚡ Action requise</p>
          <p style="margin:6px 0 0;font-size:13px;color:#666;">
            Calculer le prix exact et envoyer le lien de paiement du solde au client dans les 24h.
          </p>
        </div>

        ${lienAcces ? `
        <div style="text-align:center;margin:20px 0 0;">
          <a href="${lienAcces}"
             style="display:inline-block;background:#1e1040;color:#fff;padding:12px 28px;text-decoration:none;border-radius:100px;font-weight:700;font-size:14px;">
            Voir la réservation →
          </a>
        </div>` : ""}
      </div>
    </div>`;

    await transporter.sendMail({
      from: `"ColoCrew" <contact@colocrew.com>`,
      to: clientEmail,
      subject: `✅ Votre place est bloquée ! — ColoCrew N° ${numeroDeReservation}`,
      html: clientHtml,
    });

    await transporter.sendMail({
      from: `"ColoCrew" <contact@colocrew.com>`,
      to: "contact@colocrew.com",
      subject: `✅ Acompte reçu — ${numeroDeReservation} — ${clientFirstName} ${clientLastName}`,
      html: adminHtml,
    });

    return new Response(JSON.stringify({ message: "Emails acompte envoyés" }), {
      status: 200,
    });
  } catch (error) {
    console.error("Erreur mail-acompte:", error);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
    });
  }
}
