import { NextResponse } from "next/server";
import Stripe from "stripe";
import { MERCH_SHIPPING, resolveMerchOrder } from "@/src/lib/merchConfig";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "https://www.colocrew.com";
}

/** One order = one model, one size, one quantity, paid directly on Stripe with a flat shipping fee. */
export async function POST(request) {
  if (!stripe) return NextResponse.json({ error: "Paiement indisponible pour le moment." }, { status: 500 });

  let order;
  try {
    const body = await request.json();
    order = resolveMerchOrder(body || {});
  } catch (error) {
    return NextResponse.json({ error: error.message || "Commande invalide." }, { status: 400 });
  }

  try {
    const { product, size, priceOption, quantity } = order;
    const baseUrl = getBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: priceOption.amount * 100,
            product_data: {
              name: `${product.name} - taille ${size}`,
              description: priceOption.helper ? `${priceOption.label} (${priceOption.helper})` : priceOption.label,
              images: [`${baseUrl}${product.images[0].src}`],
            },
          },
          quantity,
        },
      ],
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
        productId: product.id,
        productName: product.name,
        size,
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
