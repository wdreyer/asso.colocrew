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

export const MERCH_MAX_TOTAL_QUANTITY = 30;

/** Price options are the same for every model: the chosen one applies to the whole order. */
export const MERCH_PRICE_OPTIONS = priceOptions;

/**
 * Checks an order of several tee-shirts against the catalogue. Throws a readable error.
 *   items: [{ productId, size, quantity }]  (one line per model + size)
 *   priceOptionId: price per tee-shirt for the whole order
 */
export function resolveMerchCart({ items, priceOptionId } = {}) {
  const priceOption = priceOptions.find((option) => option.id === priceOptionId) || priceOptions[0];
  const merged = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const quantity = Math.round(Number(item?.quantity) || 0);
    if (quantity <= 0) return;
    const key = `${item.productId}|${item.size}`;
    merged.set(key, { productId: item.productId, size: item.size, quantity: (merged.get(key)?.quantity || 0) + quantity });
  });
  const lines = [...merged.values()].map(({ productId, size, quantity }) => {
    const product = MERCH_PRODUCTS.find((candidate) => candidate.id === productId);
    if (!product) throw new Error("Modèle inconnu.");
    const sizeEntry = product.sizes.find((candidate) => candidate.value === size);
    if (!sizeEntry || sizeEntry.stock <= 0) throw new Error(`Taille ${size} indisponible en ${product.shortName.toLowerCase()}.`);
    if (quantity > MERCH_MAX_QUANTITY) throw new Error(`${MERCH_MAX_QUANTITY} maximum par taille et par couleur.`);
    if (quantity > sizeEntry.stock) throw new Error(`Plus que ${sizeEntry.stock} en ${product.shortName.toLowerCase()} taille ${size}.`);
    return { product, size, quantity, amount: priceOption.amount * quantity };
  });
  if (!lines.length) throw new Error("Choisis au moins un tee-shirt.");
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity > MERCH_MAX_TOTAL_QUANTITY) throw new Error(`${MERCH_MAX_TOTAL_QUANTITY} tee-shirts maximum par commande. Écris-nous pour plus.`);
  const itemsTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  return { lines, priceOption, quantity, itemsTotal, total: itemsTotal + MERCH_SHIPPING.amount };
}

/** Compact form for Stripe metadata (500 chars max): "productId:size:qty,…". */
export function encodeMerchLines(lines) {
  return lines.map((line) => `${line.product.id}:${line.size}:${line.quantity}`).join(",");
}

export function decodeMerchLines(value) {
  return String(value || "")
    .split(",")
    .map((chunk) => {
      const [productId, size, quantity] = chunk.split(":");
      const product = MERCH_PRODUCTS.find((candidate) => candidate.id === productId);
      return productId ? { productId, productName: product?.name || productId, color: product?.shortName || "", size, quantity: Number(quantity) || 0 } : null;
    })
    .filter(Boolean);
}
