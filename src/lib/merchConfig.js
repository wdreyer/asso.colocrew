/**
 * Tee-shirts vendus sur /merch. Paiement direct Stripe (une commande = un modèle, une taille,
 * une quantité), frais de port fixes par commande. Les commandes payées sont enregistrées par le
 * webhook Stripe dans `merch_orders` et suivies dans /dashboard/tee-shirts.
 */

export const MERCH_SHIPPING = {
  amount: 4,
  label: "Livraison à domicile",
  delay: "sous 1 semaine",
};

export const MERCH_MAX_QUANTITY = 10;

const priceOptions = [
  { id: "standard", label: "Prix normal", amount: 25, helper: "" },
  { id: "support-30", label: "Avec un petit soutien", amount: 30, helper: "5 € de plus pour l'association" },
  { id: "support-35", label: "Avec un gros soutien", amount: 35, helper: "10 € de plus pour l'association" },
];

// `stock: 0` désactive une taille.
const sizes = [
  { value: "S", stock: 18 },
  { value: "M", stock: 24 },
  { value: "L", stock: 20 },
  { value: "XL", stock: 12 },
];

export const MERCH_PRODUCTS = [
  {
    id: "colocrew-summer-tour-2026-tee-red",
    name: "Tee-shirt ColoCrew rouge",
    shortName: "Rouge",
    description: "Coton épais, coupe ample. Petit logo devant, grand visuel de l'été 2026 au dos.",
    swatch: "#b51f35",
    images: [
      { src: "/images/merch/red-shirt-summer-tour.jpeg", alt: "Dos du tee-shirt rouge ColoCrew" },
      { src: "/images/merch/beach-back-print.jpeg", alt: "Tee-shirt rouge ColoCrew porté à la plage" },
      { src: "/images/merch/red-shirt-print-close.jpg", alt: "Détail du visuel du tee-shirt rouge" },
      { src: "/images/merch/red-shirt-front-candid.jpg", alt: "Tee-shirt rouge ColoCrew porté en colo" },
      { src: "/images/merch/red-shirt-crew-candid.jpg", alt: "L'équipe ColoCrew en tee-shirts rouges" },
    ],
    sizes,
    priceOptions,
  },
  {
    id: "colocrew-summer-tour-2026-tee-white",
    name: "Tee-shirt ColoCrew blanc",
    shortName: "Blanc",
    description: "Même coupe, même coton épais. Visuel bordeaux sur fond blanc.",
    swatch: "#f8f3ee",
    images: [
      { src: "/images/merch/white-shirt-sunset.jpeg", alt: "Tee-shirt blanc ColoCrew porté au coucher du soleil" },
      { src: "/images/merch/crew-front-group.jpeg", alt: "L'équipe ColoCrew en tee-shirts rouges et blancs" },
      { src: "/images/merch/red-white-back-detail.jpg", alt: "Dos des tee-shirts ColoCrew rouge et blanc" },
    ],
    sizes,
    priceOptions,
  },
];

export function merchStartingPrice() {
  return Math.min(...MERCH_PRODUCTS.flatMap((product) => product.priceOptions.map((option) => option.amount)));
}

/** Checks a requested order against the catalogue. Throws a readable error. */
export function resolveMerchOrder({ productId, size, priceOptionId, quantity }) {
  const product = MERCH_PRODUCTS.find((candidate) => candidate.id === productId);
  if (!product) throw new Error("Modèle inconnu.");
  const sizeEntry = product.sizes.find((candidate) => candidate.value === size);
  if (!sizeEntry || sizeEntry.stock <= 0) throw new Error("Choisis une taille disponible.");
  const priceOption = product.priceOptions.find((candidate) => candidate.id === priceOptionId) || product.priceOptions[0];
  const count = Math.round(Number(quantity) || 1);
  if (count < 1 || count > MERCH_MAX_QUANTITY) throw new Error(`Quantité entre 1 et ${MERCH_MAX_QUANTITY}.`);
  if (count > sizeEntry.stock) throw new Error(`Plus que ${sizeEntry.stock} en taille ${size}.`);
  return {
    product,
    size: sizeEntry.value,
    priceOption,
    quantity: count,
    itemsTotal: priceOption.amount * count,
    total: priceOption.amount * count + MERCH_SHIPPING.amount,
  };
}
