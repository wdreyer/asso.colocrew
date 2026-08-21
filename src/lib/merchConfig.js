export const MERCH_PREORDER = {
  enabled: true,
  shippingLabel: "Expedition groupee apres la colo",
};

export const MERCH_PRODUCTS = [
  {
    id: "colocrew-summer-tour-2026-tee",
    name: "Tee-shirt ColoCrew Summer Tour 2k26",
    shortName: "Summer Tour 2k26",
    tagline: "Le tee-shirt de la crew, celui qu'on garde apres l'ete.",
    description:
      "Coupe oversize, coton epais, print poitrine et grand visuel dos. Le benefice finance directement les activites ColoCrew.",
    color: "Rouge ColoCrew",
    fit: "Coupe oversize",
    material: "100% coton",
    care: "Lavage 30 degres, retourne avant lavage",
    images: [
      {
        src: "/images/merch/crew-front-group.jpeg",
        alt: "Equipe ColoCrew portant les tee-shirts rouges et blancs",
      },
      {
        src: "/images/merch/red-shirt-summer-tour.jpeg",
        alt: "Dos du tee-shirt rouge ColoCrew Summer Tour 2k26",
      },
      {
        src: "/images/merch/beach-back-print.jpeg",
        alt: "Tee-shirt rouge ColoCrew porte a la plage",
      },
      {
        src: "/images/merch/white-shirt-sunset.jpeg",
        alt: "Tee-shirt blanc ColoCrew porte au coucher du soleil",
      },
      {
        src: "/images/merch/red-white-back-detail.jpg",
        alt: "Detail du print dos des tee-shirts ColoCrew",
      },
    ],
    sizes: [
      { value: "S", stock: 18 },
      { value: "M", stock: 24 },
      { value: "L", stock: 20 },
      { value: "XL", stock: 12 },
    ],
    priceOptions: [
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
        helper: "+5 EUR pour financer les activites.",
      },
      {
        id: "support-35",
        label: "Je soutiens fort",
        amount: 35,
        helper: "+10 EUR pour la colo.",
      },
    ],
  },
];
