export const MERCH_PREORDER = {
  enabled: true,
  shippingLabel: "Précommande - livraison dans environ 1 mois",
  detail:
    "On lance la production groupée après les commandes. Les tee-shirts arrivent dans environ 1 mois.",
};

const priceOptions = [
  {
    id: "standard",
    label: "Prix standard",
    amount: 25,
    helper: "Le tee-shirt au prix normal.",
  },
  {
    id: "support-30",
    label: "Je soutiens ColoCrew",
    amount: 30,
    helper: "+5 EUR pour financer les activités.",
  },
  {
    id: "support-35",
    label: "Je soutiens fort",
    amount: 35,
    helper: "+10 EUR pour la colo.",
  },
];

const sizes = [
  { value: "S", stock: 18 },
  { value: "M", stock: 24 },
  { value: "L", stock: 20 },
  { value: "XL", stock: 12 },
];

export const MERCH_PRODUCTS = [
  {
    id: "colocrew-summer-tour-2026-tee-red",
    name: "Tee-shirt rouge ColoCrew Summer Tour 2k26",
    shortName: "Tee-shirt rouge",
    tagline: "Le rouge de la crew, celui qui signe l'été.",
    description:
      "Coupe oversize, coton épais, print poitrine et grand visuel dos. Le bénéfice finance directement les activités ColoCrew.",
    color: "Rouge ColoCrew",
    fit: "Coupe oversize",
    material: "100% coton",
    care: "Lavage à 30 degrés, retourné avant lavage",
    swatch: "#b51f35",
    images: [
      {
        src: "/images/merch/red-shirt-summer-tour.jpeg",
        alt: "Dos du tee-shirt rouge ColoCrew Summer Tour 2k26",
      },
      {
        src: "/images/merch/beach-back-print.jpeg",
        alt: "Tee-shirt rouge ColoCrew porté à la plage",
      },
      {
        src: "/images/merch/red-shirt-print-close.jpg",
        alt: "Détail du print du tee-shirt rouge ColoCrew",
      },
      {
        src: "/images/merch/red-shirt-front-candid.jpg",
        alt: "Tee-shirt rouge ColoCrew porté en colo",
      },
      {
        src: "/images/merch/red-shirt-crew-candid.jpg",
        alt: "Ambiance ColoCrew avec tee-shirts rouges",
      },
      {
        src: "/images/merch/red-shirt-candid-shoulder.jpg",
        alt: "Tee-shirt rouge ColoCrew porté par la crew",
      },
      {
        src: "/images/merch/red-white-back-detail.jpg",
        alt: "Détail du print dos des tee-shirts ColoCrew",
      },
    ],
    sizes,
    priceOptions,
  },
  {
    id: "colocrew-summer-tour-2026-tee-white",
    name: "Tee-shirt blanc ColoCrew Summer Tour 2k26",
    shortName: "Tee-shirt blanc",
    tagline: "La version claire, facile à porter tout l'été.",
    description:
      "Même coupe oversize, même esprit ColoCrew, print bordeaux sur base blanche. Le bénéfice finance directement les activités ColoCrew.",
    color: "Blanc / print bordeaux",
    fit: "Coupe oversize",
    material: "100% coton",
    care: "Lavage à 30 degrés, retourné avant lavage",
    swatch: "#f8f3ee",
    images: [
      {
        src: "/images/merch/crew-front-group.jpeg",
        alt: "Équipe ColoCrew portant les tee-shirts rouges et blancs",
      },
      {
        src: "/images/merch/white-shirt-sunset.jpeg",
        alt: "Tee-shirt blanc ColoCrew porté au coucher du soleil",
      },
      {
        src: "/images/merch/red-white-back-detail.jpg",
        alt: "Détail du print dos des tee-shirts ColoCrew",
      },
      {
        src: "/images/merch/red-shirt-summer-tour.jpeg",
        alt: "Comparaison avec le tee-shirt rouge ColoCrew",
      },
    ],
    sizes,
    priceOptions,
  },
];
