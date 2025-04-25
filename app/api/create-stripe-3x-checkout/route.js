// app/api/create-stripe-3x-checkout/route.js
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10",
});

export async function POST(request) {
  try {
    const { amount, customer_email, description } = await request.json();
    const total = Number(amount);
    if (isNaN(total) || total <= 0) {
      throw new Error("Montant invalide");
    }

    // Montant par échéance
    const unitAmount = Math.round((total / 3) * 100);

    // Texte détaillé du 3×
    const scheduleText = 
      `1er paiement : ${(unitAmount/100).toFixed(2)} € aujourd'hui, ` +
      `ensuite ${(unitAmount/100).toFixed(2)} € dans 1 mois, ` +
      `puis ${(unitAmount/100).toFixed(2)} € dans 2 mois.`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email,

      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: unitAmount,
            recurring: { interval: "month", interval_count: 1 },
            product_data: {
              name: description || `Abonnement 3× – total ${total} €`,
              description: `${description}\n\n${scheduleText}`.trim(),
            },
          },
          quantity: 1,
        },
      ],

      subscription_data: {
        metadata: { installments_remaining: "3" },
      },

      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/paiement/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.NEXT_PUBLIC_BASE_URL}/paiement/cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("🔥 create‑checkout 3× Error:", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
