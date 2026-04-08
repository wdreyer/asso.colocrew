import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps, getApp } from "firebase/app";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

const namespace = process.env.NEXT_PUBLIC_DASHBOARD_NAMESPACE || "draft";
const collectionName = `${namespace}_pages`;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error("Variables Firebase manquantes dans .env.local");
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const homepageConfig = {
  text: {
    heroTitle: "Réinventons les colos",
    heroSubtitle: "Avec ColoCrew",
    heroQuote:
      "Une vraie équipe d'animation et de direction engagée à 2000 %, comme on en croise peu. Merci à cette belle association de cœur et d'idées, ColoCrew ✨🙏",
    heroQuoteSource: "My Creative Surf Camp — Été 2025",
    tagline: "ColoCrew, bien + que des colos 🔥",
    reservationLink: "Nos séjours sont ouverts à la réservation →",
    editorialTitle: "ColoCrew ? 🙌",
    editorialText:
      "Nous sommes une association qui porte les valeurs de l'éducation populaire et qui souhaite offrir à tous les enfants les vacances qu'ils méritent, peu importe d'où ils viennent ou leur situation économique.",
    aidesTitle: "Aides et financement 💶",
    aidesText:
      "Nous souhaitons que nos séjours soient accessibles au plus grand nombre. Nous sommes d'ores et déjà éligibles au Pass Colo, et d'autres financements existent pour soutenir les départs en vacances.",
    workTitle: "Travailler avec nous 👥",
    workText:
      "Nous pensons qu'il est nécessaire de valoriser le travail des équipes dans l'animation. Nous proposons des salaires au-dessus de la moyenne ainsi que des conditions de travail améliorées.",
  },
  features: [
    { icon: "👥", title: "Des effectifs réduits", highlight: "(50 max)" },
    { icon: "🏄", title: "Pratique sportive approfondie", sub: "Entre 6 et 8 séances encadrées" },
    { icon: "📷", title: "Un projet artistique collectif", sub: "Vlog, clip, théâtre, activité manuelle, et bien d'autres" },
    { icon: "✊", title: "Pédagogie autour de l'émancipation", sub: "Choix des repas, activités et projets !" },
  ],
  trips: [
    {
      href: "/sejours/my-creative-surf-camp",
      image: "/mcsc2026.jpg",
      badge: "Séjour phare",
      title: "My Creative Surf Camp",
      age: "11-13 / 14-17 ans",
      dates: "Juillet - Août 2026",
      cta: "Découvrir le séjour",
    },
    {
      href: "/sejours/eaux-vives-creative-camp",
      image: "/ovive.png",
      badge: "Nouveauté 2026",
      title: "Eaux Vives Creative Camp",
      age: "11-13 / 14-17 ans",
      dates: "Juillet - Août 2026",
      cta: "Découvrir le séjour",
    },
  ],
  blogArticles: [
    {
      image: "/banqueimage/surf/surf_006.jpg",
      category: "Surf",
      title: "Pourquoi le surf est le meilleur sport pour apprendre à tomber (et se relever)",
      excerpt: "Entre technique, confiance et océan, le surf transforme les ados autrement qu'aucun autre sport.",
    },
    {
      image: "/banqueimage/groupes/groupes_082.jpg",
      category: "Vie collective",
      title: "Ce qu'on entend par pédagogie de l'émancipation",
      excerpt: "Choisir ses repas, organiser sa journée, proposer des activités : chez ColoCrew, les ados décident.",
    },
    {
      image: "/banqueimage/surf/surf_005.jpg",
      category: "Famille",
      title: "5 questions avant d'inscrire son ado en séjour sportif",
      excerpt: "Budget, encadrement, programme : ce qu'il faut vérifier pour un été réussi.",
    },
  ],
  socialLinks: [
    { label: "Instagram", href: "https://www.instagram.com/_colocrew/" },
    { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61571533102707" },
    { label: "TikTok", href: "https://www.tiktok.com/@colocrew" },
  ],
  testimonials: [
    {
      displayName: "Lisa",
      type: "Jeune",
      excerpt:
        "Je ne m'attendais pas à ce que ce soit aussi génial. J'ai tout adoré : transport, centre, repas, surf, animations et ambiance.",
      avatar: "/banqueimage/groupes/groupes_074.jpeg",
    },
    {
      displayName: "Parent de Jasmine",
      type: "Parent",
      excerpt:
        "Un excellent séjour avec une équipe bienveillante. Jasmine a trouvé sa place malgré sa timidité.",
      avatar: "/banqueimage/groupes/groupes_041.jpeg",
    },
  ],
};

const documents = [
  {
    id: "homepage-config-2026",
    nom: "Homepage 2026 - configuration",
    path: "/",
    status: "draft",
    heroImage: "/video.mp4",
    body:
      "<h2>Contenu homepage 2026</h2><p>Ce document contient la configuration textuelle et visuelle de la page d'accueil (sans impacter la production).</p>",
    data: homepageConfig,
  },
  {
    id: "mentions-legales",
    nom: "Mentions légales",
    path: "/mentions-legales",
    status: "draft",
    heroImage: "",
    body:
      "<h2>Mentions légales</h2><p>Le présent site est édité par l'Association ColoCrew, régie par la loi 1901.</p><p>Adresse : 1 rue Magenta, 93500 Pantin.</p><p>Email : info@colocrew.com</p>",
    data: {},
  },
  {
    id: "rgpd",
    nom: "RGPD",
    path: "/rgpd",
    status: "draft",
    heroImage: "",
    body:
      "<h2>RGPD</h2><p>Conformément au Règlement Général sur la Protection des Données, vous disposez des droits d'accès, de rectification et de suppression.</p>",
    data: {},
  },
  {
    id: "conditions-generales",
    nom: "Conditions générales de ventes",
    path: "/conditions-generales-de-ventes",
    status: "draft",
    heroImage: "",
    body:
      "<h2>Conditions générales de ventes</h2><p>Retrouvez les conditions contractuelles applicables aux réservations ColoCrew.</p>",
    data: {},
  },
  {
    id: "qui-sommes-nous",
    nom: "Qui sommes-nous",
    path: "/qui-sommes-nous",
    status: "draft",
    heroImage: "",
    body:
      "<h2>Qui sommes-nous ?</h2><p>ColoCrew est une association qui organise des séjours sportifs et créatifs pour les jeunes.</p>",
    data: {},
  },
];

for (const item of documents) {
  await setDoc(
    doc(db, collectionName, item.id),
    {
      ...item,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      source: "seed-dashboard-content",
    },
    { merge: true },
  );
  console.log(`✔ ${item.id}`);
}

console.log(`Seed terminé dans ${collectionName}`);
