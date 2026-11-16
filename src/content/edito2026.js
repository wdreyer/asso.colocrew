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
    "Après deux ans d’activité, l’été 2026 a mis en évidence des difficultés financières et une charge de travail concentrée sur deux personnes. Nous souhaitons poursuivre les activités de ColoCrew en répartissant davantage les responsabilités. Cette page présente les missions auxquelles vous pouvez contribuer et les autres moyens de soutenir l’association.",
  socials: [
    { label: "Instagram", href: "https://www.instagram.com/_colocrew/" },
    { label: "TikTok", href: "https://www.tiktok.com/@colocrew" },
    { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61571533102707" },
  ],
  signature: "L'équipe ColoCrew",
  dateLabel: "Novembre 2026",
  heroImage: {
    src: "/images/edito/equipe-ete-2026.jpg",
    width: 1600,
    height: 1066,
    alt: "L'équipe d'animation ColoCrew de l'été 2026 en tee-shirts rouges et blancs",
  },
  // Dimensions d’origine pour un affichage sans recadrage.
  heroImageSecond: {
    src: "/images/edito/equipe-coucher-soleil-2026.jpg",
    width: 4080,
    height: 3072,
    alt: "L'équipe ColoCrew en tee-shirts rouges et blancs au coucher du soleil, juillet 2026",
  },

  // L'édito est en cours d'écriture : laisser vide tant qu'il n'est pas prêt.
  article: [],

  missions: [
    {
      id: "sejours",
      interests: ["conception", "direction", "animation"],
      title: "Les séjours",
      lead: "Préparation et encadrement des séjours.",
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
      lead: "Information des familles et suivi des inscriptions.",
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
      lead: "Suivi des dossiers et des démarches de l’association.",
      points: [
        "Monter les demandes de subvention",
        "Préparer et classer les documents",
        "Mettre à jour les outils de suivi",
      ],
    },
    {
      id: "ca",
      interests: ["ca"],
      title: "Le conseil d'administration",
      lead: "Participation aux décisions et au suivi de l’association.",
      points: [
        "Participer aux réunions et aux décisions",
        "Suivre le budget et les projets",
        "Suivre les orientations de l’association",
      ],
    },
  ],
};
