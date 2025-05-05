import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const {
      tokenUnique,
      amount,
      currency = "eur",
      sejourTitle,
      ageGroup,
      startDate,
      endDate,
      transportFee,
      insuranceOpted,
      paymentOption,
      metadata,
      customer_email,
    } = await request.json();

    // 🔄 Validation du montant
    const finalAmount = Number(amount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      throw new Error("Montant invalide");
    }

    // 🔄 Fonction de formatage des dates
    const formatDateFR = (isoString) => {
      if (!isoString) return "Non renseignée";
      const d = new Date(isoString);
      return isNaN(d.getTime())
        ? isoString
        : d.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
    };

    const startDateFR = formatDateFR(startDate);
    const endDateFR = formatDateFR(endDate);

    // 📌 Construction d'une description plus attrayante
    let description = `Séjour : ${sejourTitle} •  ${ageGroup} •  ${startDateFR} → ${endDateFR} •  ${
      typeof transportFee === "number" && transportFee > 0 ? `+${transportFee}€` : "Sur place (0€)"
    } •  ${insuranceOpted ? "Assurance incluse" : "Sans assurance"} •  ${finalAmount}€`;

    // 🔄 Gestion du mode de paiement
    const paymentOptions = {
      oneTime: "Paiement en une fois",
      deposit: "Acompte (2 fois)",
      rest: "Solde (2 fois)",
    };

    description += ` **Option de règlement** : ${
      paymentOptions[paymentOption] || "Paiement en une fois (défaut)"
    }\n\n`;
    description += `---\n\n`;
    description += ` **Montant total** : **${finalAmount}€**`;

    // 🎯 Création de la session Stripe (sans paramètre de 3DS forcé)
    const session = await stripe.checkout.sessions.create({
payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: sejourTitle,
              description,
              images: [process.env.NEXT_PUBLIC_LOGO_URL],
            },
            unit_amount: Math.round(finalAmount * 100), // conversion en centimes
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/reservation/${tokenUnique}?justCreated=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/`,
      metadata: {
        tokenUnique,
        ...metadata, // fusion des metadata
      },
      allow_promotion_codes: true,
      customer_email,
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200 });
  } catch (error) {
    console.error("🔥 Erreur Stripe :", error.message);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
