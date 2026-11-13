/**
 * Texte de la page /edito-2026.
 *
 * `draft: true` garde la page hors des moteurs de recherche (noindex) tant que le texte définitif
 * n'est pas posé. Pour publier : remplacer `article`, passer `draft` à false.
 *
 * Blocs possibles dans `article` :
 *   { type: "p", text }                 paragraphe (**gras** accepté)
 *   { type: "h2", text }                intertitre
 *   { type: "quote", text, author }     citation mise en avant
 *   { type: "list", items: [] }         liste à puces
 */

export const EDITO_2026 = {
  draft: true,
  eyebrow: "Édito · 2026",
  title: "Merci pour 2026. On construit la suite avec vous.",
  chapo:
    "Une saison de colos, des centaines de souvenirs, et une association qui grandit. Pour continuer, on a besoin de nouvelles personnes autour de la table : un peu de temps, une compétence, ou simplement votre soutien.",
  signature: "L'équipe ColoCrew",
  dateLabel: "Novembre 2026",
  heroImage: { src: "/mcsc2026.jpg", alt: "Des jeunes de ColoCrew avec leurs planches de surf sur la plage, été 2026" },

  // Texte provisoire : à remplacer par l'édito définitif.
  article: [
    {
      type: "p",
      text: "Cette année, des jeunes sont partis avec nous à la montagne l'hiver, puis à l'océan et en rivière l'été. Ils ont skié, surfé, créé des chansons, des clips et des souvenirs qu'ils racontent encore. Derrière chaque séjour, il y a une équipe d'animateurs et d'animatrices, de directeurs et de directrices, et des bénévoles qui préparent tout en amont.",
    },
    {
      type: "p",
      text: "ColoCrew est une **association d'éducation populaire**. Ça veut dire que les colos ne sont pas un produit : ce sont des projets collectifs, construits par des gens qui y croient. Et plus on est nombreux à porter ces projets, plus on peut emmener de jeunes, à des prix accessibles.",
    },
    {
      type: "quote",
      text: "Une colo réussie, ça commence bien avant le départ : dans les réunions, les dossiers, les coups de fil aux familles.",
      author: "L'équipe ColoCrew",
    },
    { type: "h2", text: "Ce dont on a besoin pour 2027" },
    {
      type: "p",
      text: "On cherche des personnes pour imaginer et encadrer les séjours, accompagner les familles au moment de l'inscription, nous aider sur l'administratif, et rejoindre le conseil d'administration. Pas besoin d'y passer toutes vos semaines : une demi-journée par mois, c'est déjà énorme pour nous.",
    },
  ],

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
