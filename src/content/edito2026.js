/**
 * Texte de la page /edito-2026.
 *
 * `draft: true` garde la page hors des moteurs de recherche (noindex). L'édito lui-même est en cours
 * d'écriture : tant que `article` est vide, la page affiche « Édito en cours d'écriture ».
 *
 * Blocs possibles dans `article` :
 *   { type: "p", text }                 paragraphe (**gras** accepté)
 *   { type: "h2", text }                intertitre
 *   { type: "quote", text, author }     citation mise en avant
 *   { type: "list", items: [] }         liste à puces
 */

export const EDITO_2026 = {
  draft: true,
  eyebrow: "Le mot de l'équipe",
  title: "Bilan de l'été 2026",
  chapo:
    "Après deux ans d'existence, nous nous sommes posé la question d'arrêter : notre moral, notre fatigue et notre situation financière se sont lourdement dégradés cet été 2026. Pourtant, nous avons envie de continuer. Mais pour cela, nous avons besoin de vous : que cette association devienne enfin un vrai collectif et ne repose plus sur deux personnes. Pour nous aider, vous pouvez remplir ce formulaire, adhérer, commander un tee-shirt, ou simplement nous suivre sur les réseaux sociaux.",
  socials: [
    { label: "Instagram", href: "https://www.instagram.com/_colocrew/" },
    { label: "TikTok", href: "https://www.tiktok.com/@colocrew" },
    { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61571533102707" },
  ],
  signature: "L'équipe ColoCrew",
  dateLabel: "Novembre 2026",
  heroImage: {
    src: "/images/edito/equipe-ete-2026.jpg",
    alt: "L'équipe d'animation ColoCrew de l'été 2026 en tee-shirts rouges et blancs",
  },

  // Contact mis en avant sous le formulaire.
  contact: {
    name: "Marion et son équipe",
    role: "Marion est l'une des responsables de ColoCrew",
    text: "Une question avant de te lancer ? Écris-nous ou appelle : Marion et l'équipe te répondent.",
    photo: "/images/merch/crew-front-group.jpeg",
    photoAlt: "Marion avec son équipe d'animation ColoCrew, en tee-shirts rouges et blancs",
    email: "contact@colocrew.com",
    phone: "01 84 21 02 30",
  },

  // L'édito est en cours d'écriture : laisser vide tant qu'il n'est pas prêt.
  article: [],

  missions: [
    {
      id: "sejours",
      interests: ["conception", "direction", "animation"],
      title: "Les séjours",
      lead: "Imaginer, diriger ou animer une colo.",
      points: [
        "Concevoir un séjour : lieu, programme, budget, partenaires",
        "Diriger une équipe sur place (BAFD ou en cours)",
        "Animer avec les jeunes (BAFA ou en cours)",
      ],
    },
    {
      id: "inscriptions",
      interests: ["inscriptions"],
      title: "Les inscriptions",
      lead: "Faire connaître les colos et accompagner les familles.",
      points: [
        "Présenter les séjours aux structures et aux mairies",
        "Répondre aux questions des parents",
        "Suivre les dossiers jusqu'au départ",
      ],
    },
    {
      id: "administratif",
      interests: ["administratif"],
      title: "L'administratif",
      lead: "Ce qui ne se voit pas, mais sans quoi rien ne part.",
      points: [
        "Monter les demandes de subvention",
        "Préparer et classer les documents",
        "Améliorer nos process et nos outils",
      ],
    },
    {
      id: "ca",
      interests: ["ca"],
      title: "Le conseil d'administration",
      lead: "Décider et suivre la vie de l'association.",
      points: [
        "Participer aux décisions importantes",
        "Suivre le budget et les projets",
        "Porter la voix de ColoCrew",
      ],
    },
  ],
};
