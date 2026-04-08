// src/data/souvenirs.js
// -----------------------------------------------------------------------------
// Ce fichier contient toutes les données éditables des pages "Souvenirs".
// Pour ajouter un nouveau séjour :
// 1) Copier un objet existant
// 2) Changer le `slug` (unique, sans espaces)
// 3) Mettre à jour les textes, images, témoignages, stats et couleurs
// 4) Ajouter les photos dans /public/photos/souvenirs/<slug>/
// -----------------------------------------------------------------------------

export const SOUVENIRS = [
  {
    slug: "surf-2025",
    titre: "My Creative Surf Camp",
    saison: "Été 2025",
    dates: "6 – 17 juillet & 3 – 14 août 2025",
    lieu: "Bidart, Pays Basque",
    intro:
      "À Bidart, l’été 2025 a pris la forme d’un vrai laboratoire de vacances : surf tous les jours, vie collective assumée, créations artistiques partagées et progression visible chez chaque jeune. Deux sessions, une même énergie. Ce souvenir raconte ce que le groupe a réellement vécu, du premier trajet aux dernières veillées.",

    hero: {
      src: "/photos/souvenirs/surf-2025/hero.jpg",
      alt: "Jeunes au coucher du soleil sur la plage de Bidart",
      credit: "Bidart, juillet 2025",
    },

    chapitres: [
      {
        id: "arrivee",
        titre: "L'arrivée à Bidart",
        texte: `Le départ s’est joué tôt, avec cette combinaison très connue des premiers jours : excitation, fatigue, et beaucoup de questions silencieuses. Dans le train, les groupes se sont formés naturellement entre jeunes qui se connaissaient déjà et celles et ceux qui regardaient encore par la fenêtre sans trop parler. L’équipe d’animation a posé un cadre simple dès les premières heures : on avance ensemble, on explique les règles, on laisse de la place à chacun pour trouver son rythme.

À l’arrivée à Bidart, la lumière de fin de matinée a tout de suite changé l’ambiance. Le centre, les espaces extérieurs, l’organisation des chambres : chaque étape a été présentée de manière concrète. Pas de grand discours, mais des repères clairs. Les jeunes ont ensuite participé à la mise en place de la vie quotidienne : affichage des rôles, premiers choix de menus, répartition des temps de groupe. Cette entrée progressive a évité l’effet “gros bloc” et permis aux plus réservés de prendre place sans pression.

Le soir, la première veillée a confirmé ce qui allait marquer tout le séjour : des temps simples, mais bien pensés. Jeux, rires, et surtout cette sensation que personne n’était laissé au bord du groupe. Dès ce premier chapitre, on a vu la promesse ColoCrew se matérialiser : des vacances structurées, mais vivantes, où la confiance se construit par petites preuves répétées.`,
        photo: {
          src: "/photos/souvenirs/surf-2025/arrivee.jpg",
          alt: "Jeunes avec sacs de voyage en gare",
          legende: "Les jeunes à la descente du train",
          position: "right",
        },
      },
      {
        id: "vagues-et-progression",
        titre: "Les vagues, les chutes, les déclics",
        texte: `Le surf a donné la colonne vertébrale du séjour. Les séances se sont enchaînées avec un vrai suivi : échauffement, lecture des conditions, travail du placement, puis retour collectif sur ce qui avait marché ou non. Très vite, la progression ne s’est pas mesurée uniquement au nombre de vagues prises, mais à la capacité de persévérer, d’analyser, d’aider son binôme et de recommencer après une série compliquée.

Chaque groupe avait son niveau, ses appréhensions et ses objectifs. Certains jeunes voulaient simplement réussir à se lever une fois. D’autres visaient des trajectoires plus propres, un meilleur timing, plus d’autonomie dans le choix des vagues. L’encadrement a tenu la même ligne pour tous : exigence bienveillante. Les corrections étaient précises, les encouragements concrets, et l’ambiance restait légère même quand l’océan rappelait ses règles.

Ce qui a frappé les familles dans les retours, c’est la transformation hors de l’eau. Les jeunes parlaient de coopération, d’entraide, de respect du rythme de chacun. Le surf a servi de déclencheur, mais les effets ont dépassé la pratique sportive : prise de confiance, meilleure expression, et envie de continuer à apprendre. C’est exactement ce qu’on cherchait : une activité forte qui fabrique du collectif, pas seulement des souvenirs de performance.`,
        photo: {
          src: "/photos/souvenirs/surf-2025/vagues.jpg",
          alt: "Session de surf encadrée pour adolescents",
          legende: "Une séance encadrée au pic de marée montante",
          position: "left",
        },
      },
      {
        id: "crea-vie-collective",
        titre: "Créer ensemble, vivre ensemble",
        texte: `Le projet artistique a été pensé comme une continuité naturelle du séjour, pas comme une activité “à côté”. Entre les sessions de surf, les groupes ont écrit, filmé, monté, enregistré, testé des formats et appris à composer avec les idées des autres. Certains ont préféré la caméra, d’autres le son, d’autres encore la coordination du groupe. Le résultat final importait moins que le processus : décider, répartir, ajuster, terminer.

La cuisine collective a joué un rôle tout aussi structurant. Choisir les repas, gérer le timing, respecter les règles d’hygiène, servir tout le monde : ces tâches concrètes ont rendu visibles des compétences rarement valorisées dans les dispositifs de vacances classiques. Les jeunes ont vu qu’ils pouvaient produire quelque chose d’utile pour le groupe, et pas seulement “participer”.

Les veillées ont fermé les journées avec un rythme solide : jeux, discussions, retours de journée. Dans ces moments, on a observé les évolutions les plus fines : prise de parole plus facile, humour partagé, attention aux autres, capacité à réguler les tensions sans drame. Au moment du départ, beaucoup parlaient d’un sentiment paradoxal : heureux de rentrer, mais frustrés que ça s’arrête. C’est souvent le signe qu’un séjour a réellement fait son travail.`,
        photo: {
          src: "/photos/souvenirs/surf-2025/collectif.jpg",
          alt: "Groupe en activité créative au centre",
          legende: "Atelier média en fin d’après-midi",
          position: "full",
        },
      },
    ],

    temoignages: [
      {
        texte:
          "Je ne m’attendais pas à ce que ce soit aussi bien. J’ai progressé en surf, mais surtout j’ai pris confiance dans le groupe.",
        auteur: "Lisa",
        age: "17 ans",
        type: "jeune",
        note: 10,
      },
      {
        texte:
          "Mon fils est réservé d’habitude. Il est revenu fier de lui et très positif. L’équipe a su le mettre en mouvement sans le brusquer.",
        auteur: "Claire",
        age: null,
        type: "parent",
        note: 10,
      },
      {
        texte:
          "Le mélange surf, autonomie et projet artistique est rare. On sent une vraie cohérence pédagogique dans les journées.",
        auteur: "Nora",
        age: null,
        type: "parent",
        note: 9,
      },
      {
        texte:
          "Les veillées et la plage, c’était incroyable. Je pensais être stressé au début, mais j’ai trouvé ma place vite.",
        auteur: "Yanis",
        age: "14 ans",
        type: "jeune",
        note: 10,
      },
      {
        texte:
          "Une vraie équipe engagée, attentive et solide. Notre fille a gagné en autonomie dès le retour à la maison.",
        auteur: "Sophie",
        age: null,
        type: "parent",
        note: 10,
      },
    ],

    galerie: [
      {
        src: "/photos/souvenirs/surf-2025/photo-01.jpg",
        alt: "Briefing de session sur la plage",
        legende: "Préparation de la séance",
        orientation: "landscape",
      },
      {
        src: "/photos/souvenirs/surf-2025/photo-02.jpg",
        alt: "Jeune en sortie de vague",
        legende: "Les premières trajectoires",
        orientation: "portrait",
      },
      {
        src: "/photos/souvenirs/surf-2025/photo-03.jpg",
        alt: "Repas collectif",
        legende: "Cuisine partagée",
        orientation: "landscape",
      },
      {
        src: "/photos/souvenirs/surf-2025/photo-04.jpg",
        alt: "Atelier création",
        legende: "Projet artistique",
        orientation: "portrait",
      },
      {
        src: "/photos/souvenirs/surf-2025/photo-05.jpg",
        alt: "Groupe au coucher de soleil",
        legende: "Fin de journée à Bidart",
        orientation: "landscape",
      },
      {
        src: "/photos/souvenirs/surf-2025/photo-06.jpg",
        alt: "Jeunes en cercle",
        legende: "Temps collectif",
        orientation: "portrait",
      },
    ],

    stats: {
      jeunes: 47,
      jours: 11,
      note_moyenne: 9.4,
    },

    couleur_accent: "#E8572E",
    couleur_bg: "#FEF9F4",
  },

  {
    slug: "ski-n-music-2026",
    titre: "Ski n Music Camp",
    saison: "Hiver 2026",
    dates: "22 – 28 février 2026",
    lieu: "Alpes françaises",
    intro:
      "Février 2026 a réuni deux intensités rarement associées avec autant d’équilibre : la montagne le jour, la création musicale le soir. Sur une semaine dense, les jeunes ont alterné progression technique, vie de groupe et production artistique. Ce souvenir retrace un séjour d’hiver pensé comme une expérience complète, exigeante et joyeuse.",

    hero: {
      src: "/photos/souvenirs/ski-n-music-2026/hero.jpg",
      alt: "Groupe sur les pistes enneigées au lever du jour",
      credit: "Station des Alpes, février 2026",
    },

    chapitres: [
      {
        id: "premiers-virages",
        titre: "Premiers virages, premiers repères",
        texte: `Dès la montée vers la station, le séjour a pris sa couleur : sacs chargés, playlists partagées, et cette impatience propre aux départs d’hiver. L’installation s’est faite rapidement, avec un fonctionnement immédiatement lisible : organisation des chambres, présentation des espaces communs, points sécurité et gestion du matériel. Le cadre était précis, mais l’ambiance restait détendue, ce qui a aidé les plus timides à entrer dans le groupe sans pression.

Sur les premières sorties, les écarts de niveau étaient visibles, comme toujours en ski. L’encadrement a travaillé par paliers : confiance sur les appuis, trajectoires simples, lecture du terrain, puis adaptation progressive des groupes. Les jeunes déjà autonomes ont été mobilisés de manière utile, en appui sur les moments de transition, ce qui a renforcé la dynamique collective au lieu de créer deux rythmes opposés.

Le soir, les retours de piste ont servi de sas. On ne passait pas d’un effort physique à un atelier créatif sans transition : temps calme, repas, brief du lendemain. Cette gestion du rythme a clairement évité les baisses d’énergie et permis de garder une qualité de présence jusqu’au bout de la semaine. Très tôt, on a compris que ce séjour ne se limiterait pas à “faire du ski”, mais qu’il construirait un vrai parcours d’hiver, pensé dans le détail.`,
        photo: {
          src: "/photos/souvenirs/ski-n-music-2026/virages.jpg",
          alt: "Jeunes en descente encadrée",
          legende: "Premier jour de progression sur piste bleue",
          position: "right",
        },
      },
      {
        id: "musique-et-collectif",
        titre: "Musique, studio, énergie commune",
        texte: `La particularité de Ski n Music, c’est l’articulation entre effort sportif et expression artistique. Les ateliers musique n’étaient pas un simple “bonus après ski”, mais un deuxième terrain d’apprentissage. Écriture de textes, travail du rythme, enregistrement voix, premières maquettes : chaque groupe a trouvé sa manière d’entrer dans le projet, que ce soit par la production, l’interprétation ou la coordination.

Les jeunes ont été accompagnés sur des outils concrets, avec des objectifs réalistes à l’échelle d’une semaine : sortir une structure, finaliser un refrain, produire un enregistrement propre, préparer une restitution. Ce cadre a permis de passer rapidement du “on teste” au “on construit”. Le sentiment de progression a été très fort, notamment chez celles et ceux qui n’avaient jamais osé prendre un micro ou proposer une idée en collectif.

Les temps de création ont aussi joué un rôle de cohésion. Là où la piste met parfois les différences de niveau en évidence, le studio redistribue les places. Un jeune peu à l’aise en ski peut devenir moteur en composition, pendant qu’un autre très solide sur neige découvre la complexité du travail d’équipe artistique. Cette circulation des rôles a renforcé le respect mutuel et donné au séjour une texture plus riche qu’un format mono-activité.`,
        photo: {
          src: "/photos/souvenirs/ski-n-music-2026/studio.jpg",
          alt: "Atelier d'écriture et d'enregistrement",
          legende: "Session studio en fin de journée",
          position: "left",
        },
      },
      {
        id: "derniere-journee",
        titre: "Dernière journée, traces durables",
        texte: `La fin du séjour a condensé tout ce qui s’était construit pendant la semaine. Côté montagne, les groupes ont consolidé leurs acquis sur des parcours plus fluides, avec une autonomie plus nette dans la gestion des trajectoires et de la vitesse. Côté musique, les productions ont été finalisées puis partagées dans une restitution conviviale, sans esprit de compétition, mais avec une vraie exigence sur la qualité du rendu.

Ce qui est ressorti des échanges de clôture, c’est la variété des “victoires” personnelles. Pour certains, c’était une première descente maîtrisée en confiance. Pour d’autres, c’était le fait d’écrire un texte et de le défendre devant le groupe. Plusieurs jeunes ont aussi parlé de ce qu’ils retiennent de la vie collective : meilleure gestion de leurs affaires, plus d’attention aux autres, capacité à prendre leur place sans écraser celle du voisin.

Au retour, les familles ont souligné un point récurrent : leurs enfants revenaient fatigués, mais alignés, avec des souvenirs précis et une vraie fierté. C’est ce que l’équipe visait : un séjour court mais dense, qui laisse des traces utiles au-delà des vacances. En une semaine, la montagne et la musique ont produit un même effet : faire grandir, concrètement.`,
        photo: {
          src: "/photos/souvenirs/ski-n-music-2026/finale.jpg",
          alt: "Restitution musicale du groupe",
          legende: "Restitution de fin de séjour",
          position: "full",
        },
      },
    ],

    temoignages: [
      {
        texte:
          "J’avais peur de ne pas suivre en ski, mais j’ai progressé tous les jours. Et le studio, c’était vraiment le meilleur moment.",
        auteur: "Noé",
        age: "13 ans",
        type: "jeune",
        note: 10,
      },
      {
        texte:
          "Organisation claire, équipe présente, communication rassurante. Notre fils a adoré le format sport + musique.",
        auteur: "Élise",
        age: null,
        type: "parent",
        note: 10,
      },
      {
        texte:
          "Le séjour m’a aidée à parler devant les autres. Je repars avec des amis et une chanson qu’on a écrite ensemble.",
        auteur: "Maya",
        age: "15 ans",
        type: "jeune",
        note: 10,
      },
      {
        texte:
          "Très bon encadrement, rythme soutenu mais bien tenu. On sent une vraie intention éducative derrière chaque temps.",
        auteur: "Karim",
        age: null,
        type: "parent",
        note: 9,
      },
      {
        texte:
          "Une semaine courte mais hyper intense. Je reviendrai clairement l’an prochain.",
        auteur: "Tom",
        age: "14 ans",
        type: "jeune",
        note: 10,
      },
    ],

    galerie: [
      {
        src: "/photos/souvenirs/ski-n-music-2026/photo-01.jpg",
        alt: "Départ sur les pistes",
        legende: "Brief du matin",
        orientation: "landscape",
      },
      {
        src: "/photos/souvenirs/ski-n-music-2026/photo-02.jpg",
        alt: "Portrait en montagne",
        legende: "Temps de pause",
        orientation: "portrait",
      },
      {
        src: "/photos/souvenirs/ski-n-music-2026/photo-03.jpg",
        alt: "Groupe en atelier musique",
        legende: "Écriture collective",
        orientation: "landscape",
      },
      {
        src: "/photos/souvenirs/ski-n-music-2026/photo-04.jpg",
        alt: "Jeunes au micro",
        legende: "Prise voix",
        orientation: "portrait",
      },
      {
        src: "/photos/souvenirs/ski-n-music-2026/photo-05.jpg",
        alt: "Vue de station en soirée",
        legende: "Après les pistes",
        orientation: "landscape",
      },
      {
        src: "/photos/souvenirs/ski-n-music-2026/photo-06.jpg",
        alt: "Groupe rassemblé",
        legende: "Clôture du séjour",
        orientation: "portrait",
      },
    ],

    stats: {
      jeunes: 39,
      jours: 7,
      note_moyenne: 9.6,
    },

    couleur_accent: "#4C63D9",
    couleur_bg: "#F3F6FF",
  },
];

export function getSouvenirBySlug(slug) {
  return SOUVENIRS.find((item) => item.slug === slug) || null;
}
