import { NextResponse } from "next/server";
import Stripe from "stripe";
import { MERCH_SHIPPING, encodeMerchLines, resolveMerchCart } from "@/src/lib/merchConfig";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "https://www.colocrew.com";
}

/**
 * Several tee-shirts (colours × sizes) at one price level, paid directly on Stripe with a flat
 * shipping fee per order. Body: { items: [{ productId, size, quantity }], priceOptionId }.
 */
export async function POST(request) {
  if (!stripe) return NextResponse.json({ error: "Paiement indisponible pour le moment." }, { status: 500 });

  let cart;
  try {
    cart = resolveMerchCart((await request.json()) || {});
  } catch (error) {
    return NextResponse.json({ error: error.message || "Commande invalide." }, { status: 400 });
  }

  try {
    const baseUrl = getBaseUrl();
    const { lines, priceOption, quantity } = cart;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      line_items: lines.map((line) => ({
        price_data: {
          currency: "eur",
          unit_amount: priceOption.amount * 100,
          product_data: {
            name: `${line.product.name} - taille ${line.size}`,
            description: priceOption.helper ? `${priceOption.label} (${priceOption.helper})` : priceOption.label,
            images: [`${baseUrl}${line.product.images[0].src}`],
          },
        },
        quantity: line.quantity,
      })),
      shipping_address_collection: { allowed_countries: ["FR", "BE", "CH", "LU"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: `${MERCH_SHIPPING.label}, ${MERCH_SHIPPING.delay}`,
            fixed_amount: { amount: MERCH_SHIPPING.amount * 100, currency: "eur" },
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 7 },
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      success_url: `${baseUrl}/merch?commande=ok`,
      cancel_url: `${baseUrl}/merch?commande=annulee`,
      metadata: {
        source: "colocrew-merch",
        lines: encodeMerchLines(lines),
        priceOption: priceOption.id,
        unitAmount: String(priceOption.amount),
        quantity: String(quantity),
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[merch-checkout] session Stripe impossible:", error);
    return NextResponse.json({ error: "Paiement indisponible pour le moment. Réessaie dans un instant." }, { status: 502 });
  }
}
