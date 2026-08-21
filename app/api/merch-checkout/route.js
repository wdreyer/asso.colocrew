import { NextResponse } from "next/server";
import Stripe from "stripe";
import { MERCH_PRODUCTS } from "@/src/lib/merchConfig";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "https://www.colocrew.com";
}

export async function POST(request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Paiement Stripe non configure." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ error: "Panier vide." }, { status: 400 });
    }

    const lineItems = items.map((item) => {
      const product = MERCH_PRODUCTS.find((candidate) => candidate.id === item.productId);
      if (!product) throw new Error("Produit inconnu.");

      const size = product.sizes.find((candidate) => candidate.value === item.size);
      if (!size || size.stock <= 0) throw new Error("Taille indisponible.");

      const priceOption = product.priceOptions.find((candidate) => candidate.id === item.priceOptionId);
      if (!priceOption) throw new Error("Option de prix invalide.");

      const quantity = Math.max(1, Math.min(10, Math.round(Number(item.quantity) || 1)));
      if (quantity > size.stock) throw new Error(`Stock insuffisant en taille ${size.value}.`);

      return {
        price_data: {
          currency: "eur",
          product_data: {
            name: `${product.name} - Taille ${size.value}`,
            description: `${priceOption.label} - ${priceOption.amount} EUR. Le supplement finance directement ColoCrew.`,
            images: [`${getBaseUrl()}${product.images[0].src}`],
            metadata: {
              productId: product.id,
              size: size.value,
              priceOption: priceOption.id,
            },
          },
          unit_amount: priceOption.amount * 100,
        },
        quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ["FR", "BE", "CH", "LU"],
      },
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${getBaseUrl()}/merch?commande=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getBaseUrl()}/merch?commande=annulee`,
      metadata: {
        source: "colocrew-merch",
        itemCount: String(items.length),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Erreur merch checkout:", error);
    return NextResponse.json(
      { error: error.message || "Erreur pendant la creation du paiement." },
      { status: 400 }
    );
  }
}
