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
      installments,
    } = await request.json();

    const isDeposit = paymentOption === "deposit" || metadata?.paymentType === "deposit";

    // 🔄 Validation du montant
    const finalAmount = isDeposit ? 100 : Number(amount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      throw new Error("Montant invalide");
    }

    const installmentsCount = Math.round(Number(installments));
    const isInstallments = !isDeposit && Number.isFinite(installmentsCount) && installmentsCount > 1;

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
      deposit: "Acompte de réservation",
      rest: "Solde restant",
    };

    description += ` **Option de règlement** : ${
      isInstallments ? `Paiement en ${installmentsCount} fois` : (paymentOptions[paymentOption] || "Paiement en une fois (défaut)")
    }\n\n`;
    description += `---\n\n`;
    description += ` **Montant à payer** : **${finalAmount}€**`;

    if (isInstallments) {
      // 🎯 Paiement en plusieurs fois : abonnement Stripe mensuel, prélevé immédiatement
      // puis à chaque échéance. `cancel_at` n'est pas un paramètre valide à la création
      // d'une session Checkout (il n'existe qu'une fois l'abonnement créé) : on le pose
      // depuis le webhook (checkout.session.completed) une fois la session confirmée.
      const perInstallment = Math.round((finalAmount / installmentsCount) * 100) / 100;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              recurring: { interval: "month" },
              product_data: {
                name: `${sejourTitle} — paiement en ${installmentsCount} fois`,
                description,
                images: [process.env.NEXT_PUBLIC_LOGO_URL],
              },
              unit_amount: Math.round(perInstallment * 100),
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        subscription_data: {
          metadata: {
            tokenUnique,
            paymentType: "installments",
            installments: String(installmentsCount),
            ...metadata,
          },
        },
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/reservation/${tokenUnique}?justCreated=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/`,
        metadata: {
          tokenUnique,
          paymentType: "installments",
          installments: String(installmentsCount),
          ...metadata,
        },
        customer_email,
      });

      return new Response(JSON.stringify({ url: session.url }), { status: 200 });
    }

    // 🎯 Création de la session Stripe (paiement unique, sans paramètre de 3DS forcé)
    const session = await stripe.checkout.sessions.create({
payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: isDeposit ? `Acompte - ${sejourTitle}` : sejourTitle,
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
        ...(isDeposit ? { paymentType: "deposit" } : {}),
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
