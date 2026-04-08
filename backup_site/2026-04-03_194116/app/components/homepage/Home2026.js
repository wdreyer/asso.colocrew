"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase";

/* ─────────────────────────────────────────
   DONNÉES
───────────────────────────────────────── */
const text = {
  heroTitle: "Réinventons les colos",
  heroSubtitle: "Avec ColoCrew",
  heroQuote:
    "Une vraie équipe d'animation et de direction engagée à 2000 %, comme on en croise peu. Merci à cette belle association de cœur et d'idées, ColoCrew ✨🙏",
  heroQuoteSource: "My Creative Surf Camp — Été 2025",
  tagline: "ColoCrew, bien + que des colos 🔥",
  reservationLink: "Nos séjours sont ouverts à la réservation →",
  sejoursTextA: "Les séjours",
  editorialTitle: "ColoCrew ? 🙌",
  editorialText:
    "Nous sommes une association qui porte les valeurs de l'éducation populaire et qui souhaite offrir à tous les enfants les vacances qu'ils méritent, peu importe d'où ils viennent ou leur situation économique.",
  socialTitle: "Nos réseaux sociaux",
  socialText:
    "Nous sommes également très actifs sur les réseaux, retrouvez-nous sur Facebook et Instagram.",
  reservationTitle: "Demande de réservation",
  reservationText:
    "Faites votre demande de réservation en ligne et nous vous envoyons un devis personnalisé dans les 24h.",
  aidesTitle: "Aides et financement 💶",
  aidesText:
    "Nous souhaitons que nos séjours soient accessibles au plus grand nombre. Nous sommes d'ores et déjà éligibles au Pass Colo, et d'autres financements existent pour soutenir les départs en vacances.",
  workTitle: "Travailler avec nous 👥",
  workText:
    "Nous pensons qu'il est nécessaire de valoriser le travail des équipes dans l'animation. Nous proposons des salaires au dessus de la moyenne ainsi que des conditions de travail améliorées.",
  sejoursSummaryText:
    "En 2026, nous proposons une offre diversifiée de séjours basée sur une pédagogie commune.",
  cta: "Nos séjours sont ouverts à la réservation.",
};

const PALETTE = {
  accent: "#A45A86",
  accentHover: "#8F4F76",
  text: "#24173D",
  textSoft: "#5B4B6F",
  rosePastel: "#F2DDE8",
  roseLight: "#F7EAF1",
  lavender: "#F5F0FA",
  blush: "#FDF7FB",
};


const features = [
  { icon: "👥", title: "Des effectifs réduits ", highlight: "(50 max)" },
  { icon: "🏄", title: "Pratique sportive approfondie", sub: "Entre 6 et 8 séances encadrées" },
  { icon: "📷", title: "Un projet artistique collectif",sub: "Vlog, clip, théatre, activité manuelle, et bien d'autres" },
  { icon: "✊", title: "Pédagogie autour de l'émancipation", sub: "Choix des repas, activités et projets !" },
];

const trips = [
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
];

const homepageTestimonialsManual = [
  {
    name: "Merlot Lisa (17 ans)",
    displayName: "Lisa",
    type: "Enfant",
    period: "3 – 14 août",
    excerpt:
      "Je ne m'attendais pas à ce que ce soit aussi génial. J'ai tout adoré : transport, centre, repas, surf, animations et ambiance.",
    fullText:
      "Je ne m'attendais pas à ce que ce soit aussi génial ! Je n'ai rien eu à redire, j'ai tout adoré !!\n\nLe transport : trop bien, même si ça a été triste quand on s'est séparés.\nLe centre : propre, avec de grandes chambres ; on était trop bien.\nLes repas : superbe idée de nous avoir demandé de faire à manger et de pouvoir choisir nos repas.\nLe surf : meilleure expérience, les coachs étaient sympathiques.\nLes animations : parfaites, je me suis amusée et en plus ça bougeait.\nL'ambiance : nickel, surtout les jeux.\nL'équipe : très bien, restez comme vous êtes, vous étiez à l'écoute.\n\nMon meilleur souvenir : le surf, la plage et les veillées ; en fait un peu tout.\nJe reviendrais carrément revivre le surf !",
    avatar: "/banqueimage/groupes/groupes_074.jpeg",
  },
  {
    name: "Famille de Bryan Texier",
    displayName: "Bryan",
    type: "Parent",
    period: "6 – 17 juillet",
    excerpt:
      "Très belle expérience. Aux parents qui hésitent encore : laissez partir votre enfant, s'amuser, grandir…",
    fullText:
      "Très belle expérience. Aux parents qui hésitent encore : laissez partir votre enfant, s'amuser, grandir…\nPour ma part, tout s'est bien passé de A à Z. Encore merci.\n\nMon fils est réservé ; au début il m'a dit qu'il allait négocier pour ne pas faire le projet artistique. Au final, il a fait comme les autres, ça lui a fait le plus grand bien.\nMerci aux animateurs.\n\nLe prof de surf, très sympa, a fait bonne impression auprès des jeunes.\nC'est unique et appréciable de recevoir des messages et des vidéos : ça rappelle les bons moments.\n\nJe recommande ce séjour : les animateurs font participer les enfants, mon fils était ravi, et c'est ça le principal.\nÀ voir le sourire sur son visage, j'ai vu qu'un truc s'était passé en lui. Une sorte de satisfaction.",
    avatar: "/banqueimage/groupes/groupes_080.jpeg",
  },
  {
    name: "Famille de Ninon Buisson",
    displayName: "Ninon",
    type: "Parent",
    period: "20 – 31 juillet",
    excerpt:
      "Ambiance générale incroyable selon elle ; hâte du prochain séjour. Communication Kidizz très appréciée des parents.",
    fullText:
      "Ambiance générale incroyable selon elle, hâte du prochain séjour, avec la même équipe jeunes et encadrants.\n\nMERCI À VOUS.\nLa communication via Kidizz : incroyable et très appréciée des parents.\nSuper encadrement, Ninon était ravie.\n\nNote globale : 10/10.",
    avatar: "/banqueimage/groupes/groupes_101.jpg",
  },
  {
    name: "Famille de Jasmine",
    displayName: "Jasmine",
    type: "Parent",
    period: "6 – 17 juillet",
    excerpt:
      "Un excellent séjour avec une équipe bienveillante. Jasmine a trouvé sa place malgré sa timidité.",
    fullText:
      "Un excellent séjour, car d'excellents professionnels, ouverts d'esprit, intelligents et bienveillants.\nUne excellente équipe soucieuse de faire vivre de vraies et belles vacances.\n\nJasmine a trouvé sa place malgré sa timidité. Merci.\nElle souhaite y retourner l'été prochain et a donné rendez-vous à ses copines et copains.\n\nElle est plus autonome : elle prend davantage la parole à la maison et en classe, elle est déléguée, et elle fait à manger quand je ne suis pas là.\nLe fait que ma fille soit heureuse de m'envoyer des messages pour me dire combien elle s'amuse et qu'elle a des tas d'amis : pour un parent, c'est le plus beau cadeau.\n\nJasmine a refait des plats à la maison. Elle demande plus à cuisiner et a encore plus la notion du partage.\n\nNote globale : 10/10.",
    avatar: "/banqueimage/groupes/groupes_041.jpeg",
  },
  {
    name: "Famille de Julia Ligniez",
    displayName: "Julia",
    type: "Parent",
    period: "6 – 17 juillet",
    excerpt:
      "Vraiment ravis. Julia est revenue marquée par son séjour ; une organisation carrée, sympa et très pro.",
    fullText:
      "Vraiment ravis.\nJulia et sa copine sont parties 'en pleurant' et revenues en pleurant réellement, ayant passé un séjour qu'elles n'oublieront pas.\n\nC'était nous qui avions poussé Julia à faire une colo ; elle n'était pas chaude, mais nous pensions que ça lui ferait du bien.\nLa réunion pré-séjour : on sent que c'est carré, sympa et très pro en même temps.\n\nVous avez su leur faire prendre plaisir à vivre en extérieur, manger des préparations maison faites par eux, et avoir des rapports simples et vivants entre eux…\nChapeau pour un groupe d'une quarantaine !\n\nNote globale : 10/10.",
    avatar: "/banqueimage/groupes/groupes_074.jpeg",
  },
  {
    name: "Clarence & Coline Etienne",
    displayName: "Clarence & Coline",
    type: "Parent",
    period: "20 – 31 juillet",
    excerpt:
      "Meilleure colo, incroyable, à refaire ! Une vraie équipe d'animation et de direction engagée à 2000 %.",
    fullText:
      "Meilleure colo, incroyable, à refaire !\n\nUne vraie équipe d'animation et de direction engagée à 2000 % comme on en croise peu.\nMerci à cette belle association de cœur et d'idées, ColoCrew ✨🙏\n\nMy Creative Surf Camp.\nNote : 5 étoiles.\nNote globale : 10/10.",
    avatar: "/banqueimage/groupes/groupes_044.jpeg",
  },
];

const blogArticles = [
  {
    image: "/banqueimage/surf/surf_006.jpg",
    category: "Surf",
    title: "Pourquoi le surf est le meilleur sport pour apprendre à tomber (et se relever)",
    excerpt: "Entre technique, confiance et océan, le surf transforme les ados autrement qu'aucun autre sport.",
  },
  {
    image: "/banqueimage/groupes/groupes_082.jpg",
    category: "Vie collective",
    title: "Ce qu'on entend par « pédagogie de l'émancipation » — concrètement",
    excerpt: "Choisir ses repas, organiser sa journée, proposer des activités : chez ColoCrew, les ados décident.",
  },
  {
    image: "/banqueimage/surf/surf_005.jpg",
    category: "Famille",
    title: "5 questions à se poser avant d'inscrire son ado en séjour sportif",
    excerpt: "Budget, encadrement, programme : tout ce qu'il faut vérifier pour un été réussi.",
  },
];

const galeriePhotos = [
  "/banqueimage/groupes/groupes_080.jpeg",
  "/banqueimage/groupes/groupes_008.jpeg",
  "/banqueimage/groupes/groupes_064.jpeg",
  "/banqueimage/groupes/groupes_016.jpeg",
  "/banqueimage/groupes/groupes_101.jpg",
  "/banqueimage/groupes/groupes_041.jpeg",
];

const streamMosaicImages = [
  "/banqueimage/portraits/portraits_064.jpg",
  "/banqueimage/groupes/groupes_085.jpg",
  "/banqueimage/surf/surf_002.jpg",
  "/banqueimage/groupes/groupes_083.jpg",
  "/banqueimage/surf/surf_004.jpg",
  "/banqueimage/plage/plage_003.jpg",
];

const streamMiniSections = [
  { title: text.reservationTitle, body: text.reservationText, href: "/reservation" },
  {
    title: text.socialTitle,
    body: text.socialText,
    href: "https://www.instagram.com/_colocrew/",
    external: true,
  },
  { title: text.editorialTitle, body: text.editorialText, href: "/qui-sommes-nous" },
  { title: "Les séjours 🏖️", body: text.sejoursSummaryText, href: "/sejours" },
  { title: text.aidesTitle, body: text.aidesText, href: "/aide-financement" },
  { title: text.workTitle, body: text.workText, href: "/qui-sommes-nous" },
];

function pickQuoteFromRetour(retour) {
  const candidates = [
    ...(Array.isArray(retour?.highlights) ? retour.highlights : []),
    ...((Array.isArray(retour?.comments) ? retour.comments : []).map((entry) => entry?.text)),
  ]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 40 && value.length <= 260);

  return candidates[0] || "";
}

function pickAuthorFromRetour(retour) {
  return String(
    retour?.parentName ||
      retour?.respondentName ||
      retour?.childName ||
      (retour?.respondentType === "jeune" ? "Jeune ColoCrew" : "Parent ColoCrew")
  ).trim();
}

/* ─────────────────────────────────────────
   ANIMATION
───────────────────────────────────────── */
const revealVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

function Reveal({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      variants={revealVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────
   VAGUE — pattern exact demandé
   fill = couleur du fond de la section SUIVANTE
───────────────────────────────────────── */
function Wave({ fill }) {
  return (
    <div style={{ overflow: "hidden", lineHeight: 0, marginBottom: "-1px" }}>
      <svg
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", height: "60px" }}
      >
        <path
          d="M0,30 C300,60 900,0 1200,30 L1200,60 L0,60 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}

/* Version inversée (pour sortir d'une section en remontant) */
function WaveUp({ fill }) {
  return (
    <div style={{ overflow: "hidden", lineHeight: 0, marginTop: "-1px" }}>
      <svg
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", height: "60px" }}
      >
        <path
          d="M0,30 C300,0 900,60 1200,30 L1200,0 L0,0 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────
   SECTION 1 — HERO VIDÉO
   → vers blanc (#ffffff)
───────────────────────────────────────── */
function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden", height: "55vh", minHeight: 340, backgroundColor: "#231a35" }}>
      <video
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        poster="/load.png"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      >
        <source src="/video.mp4" type="video/mp4" />
      </video>

      {/* Overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.65) 100%)",
      }} />
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-[#f7dbe9]/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-12 h-72 w-72 rounded-full bg-[#d8c8f0]/25 blur-3xl" />

      {/* Slogan centré */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 24px" }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          <h1 style={{
            fontFamily: "\"Baloo 2\", cursive",
            fontSize: "clamp(2.2rem, 5.5vw, 5rem)",
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.1,
            textShadow: "0 3px 28px rgba(0,0,0,0.55)",
            margin: 0,
          }}>
            {text.heroTitle}
          </h1>
          <p style={{
            fontFamily: "\"Baloo 2\", cursive",
            fontSize: "clamp(1.1rem, 2.8vw, 2.2rem)",
            fontWeight: 600,
            color: "#ffffff",
            letterSpacing: "0.1em",
            textShadow: "0 2px 18px rgba(0,0,0,0.5)",
            marginTop: 12,
          }}>
            {text.heroSubtitle}
          </p>
          <div
            style={{
              margin: "30px auto 0",
              maxWidth: 860,
              padding: "0 10px",
              color: "#ffffff",
              textShadow: "0 2px 16px rgba(0,0,0,0.55)",
            }}
          >
            <p
              style={{
                fontSize: "clamp(0.76rem, 1.4vw, 0.96rem)",
                lineHeight: 1.5,
                fontStyle: "italic",
                fontWeight: 600,
                margin: 0,
              }}
            >
              "{text.heroQuote}"
            </p>
            <p
              style={{
                marginTop: 7,
                fontSize: "clamp(0.66rem, 1.05vw, 0.8rem)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.9,
                fontWeight: 700,
              }}
            >
              {text.heroQuoteSource}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Vague vers blanc */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <Wave fill={PALETTE.rosePastel} />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────
   SECTION 2 — FEATURES + CARTES SÉJOURS
   fond blanc → vers dark (#0d0a1f)
───────────────────────────────────────── */
function FeaturesAndTrips() {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: PALETTE.rosePastel }}>
      <div className="pointer-events-none absolute -left-24 top-8 h-80 w-80 rounded-full bg-[#ffffff]/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[#e7d9f8]/45 blur-3xl" />
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-10 px-5 pt-4 pb-12 md:grid-cols-2 md:gap-10 md:px-8 md:pb-16">

        {/* Gauche — features */}
        <Reveal className="flex flex-col justify-center">
          <h2 style={{ fontFamily: "\"Baloo 2\", cursive", fontSize: "clamp(1.25rem, 2vw, 1.65rem)", fontWeight: 800, color: PALETTE.text, lineHeight: 1.2, marginBottom: 32, whiteSpace: "nowrap" }}>
            {text.tagline}
          </h2>

          <div className="space-y-5">
            {features.map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-lg shadow-sm">
                  {item.icon}
                </div>
                <div>
                  <p style={{ fontSize: "1.05rem", fontWeight: 700, color: PALETTE.text }}>
                    {item.title}
                    {item.highlight && <span style={{ color: PALETTE.accent }}>{item.highlight}</span>}
                  </p>
                  {item.sub && <p style={{ fontSize: "0.875rem", fontWeight: 500, color: PALETTE.textSoft, marginTop: 2 }}>{item.sub}</p>}
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/sejours"
            className="resa-cta-link"
            style={{ marginTop: 36, display: "inline-flex", alignItems: "center", gap: 8, fontSize: "1.15rem", fontWeight: 700, color: PALETTE.accent, textDecoration: "none", transition: "gap 0.22s, color 0.18s" }}
          >
            {text.reservationLink}
            <style>{`
              .resa-cta-link { border-bottom: 2px solid transparent; padding-bottom: 3px; transition: border-color 0.22s, gap 0.22s, color 0.18s !important; }
              .resa-cta-link:hover { border-color: ${PALETTE.accent} !important; gap: 16px !important; color: ${PALETTE.accentHover} !important; }
            `}</style>
          </Link>
        </Reveal>

        {/* Droite — 2 cartes image-fond */}
        <div className="flex flex-col gap-5">
          {trips.map((trip, i) => (
            <Reveal key={trip.title} delay={i * 0.1}>
              <Link href={trip.href} className="block cursor-pointer" aria-label={trip.title}>
                <article className="group relative overflow-hidden rounded-2xl shadow-lg" style={{ height: 220 }}>
                  <Image
                    src={trip.image}
                    alt={trip.title}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <span className="absolute left-4 top-4 rounded bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[#A45A86] shadow">
                    {trip.badge}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
                    <h3 style={{ fontFamily: "\"Baloo 2\", cursive", fontWeight: 700, fontSize: "1.15rem", color: "#fff" }}>{trip.title}</h3>
                    <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.78)", marginTop: 4 }}>{trip.dates} · {trip.age}</p>
                    <span className="mt-3 inline-flex items-center rounded bg-[#A45A86] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white transition group-hover:bg-[#8F4F76]">
                      {trip.cta}
                    </span>
                  </div>
                </article>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Vague vers section Colocrew */}
      <Wave fill={PALETTE.lavender} />
    </section>
  );
}

/* ─────────────────────────────────────────
   SECTION 3 — QUI SOMMES-NOUS
   fond #f4f0fb → vers #fdf8f9
───────────────────────────────────────── */

const CSS_STREAM = `
  .bento-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .bento-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 14px 36px rgba(164,90,134,0.16);
  }
  .bento-photo img {
    transition: filter 0.3s ease, transform 0.4s ease;
  }
  .bento-photo:hover img {
    filter: saturate(1.12);
    transform: scale(1.04);
  }
  .photo-social-link {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.25);
    backdrop-filter: blur(6px);
    transition: background 0.18s ease;
  }
  .photo-social-link:hover {
    background: rgba(255,255,255,0.25);
  }
`;

const BENTO_CARDS = [
  {
    href: "/sejours",
    bg: "#FFF2F8",
    border: "#F0D3E3",
    dark: false,
    title: "Les séjours 🏖️",
    body: "En 2026, nous revenons avec de nouveaux séjours pour tous les goûts. Toujours la même formule : 12 jours, 40 jeunes, des activités sportives, un projet artistique et des repas préparés avec tout le monde !",
  },
  {
    href: "/aide-financement",
    bg: "#F3EEFC",
    border: "#DFD2F4",
    dark: false,
    title: "Aides et financement 💶",
    body: "En 2026, de nouvelles aides sont disponibles et nous sommes éligibles à la plupart d'entre elles. Nous sommes éligibles a l'aide VACAF nationale, au Pass Colo. Nous proposons aussi des facilités de paiement comme le paiement en plusieurs fois et les chèques vacances.",
  },
  {
    href: "/anims",
    bg: "#EEF7FB",
    border: "#D2E8F2",
    dark: false,
    title: "Travailler avec nous 👥",
    body: "Nous adoptons une politique transparente sur les salaires, mais également les conditions de travail. Nous proposons des formations, des temps de préparation, mais également la mise en place de nombreux repos au cours des séjours.",
  },
];

function StreamSection() {
  return (
    <>
      <style>{CSS_STREAM}</style>
      <section className="relative overflow-hidden" style={{ background: PALETTE.lavender }}>
        <div className="pointer-events-none absolute -left-20 top-12 h-72 w-72 rounded-full bg-[#f4dfea]/55 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-4 h-72 w-72 rounded-full bg-[#e5dcf7]/55 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[1240px] px-8 pb-12 pt-10 md:pb-16 md:pt-14">

          {/* ── Intro ── */}
          <Reveal>
            <div className="mb-8 flex flex-col items-start gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: PALETTE.accent, marginBottom: 4 }}>
                  Notre association
                </p>
                <h2 style={{ fontFamily: '"Baloo 2", cursive', fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", fontWeight: 800, color: PALETTE.text, lineHeight: 1.1 }}>
                  {text.editorialTitle}
                </h2>
                <p style={{ marginTop: 10, fontSize: "1rem", lineHeight: 1.6, color: PALETTE.textSoft, maxWidth: 560 }}>
                  {text.editorialText}
                </p>
              </div>
              <Link
                href="/qui-sommes-nous"
                className="bento-card mt-4 shrink-0 md:mt-0"
                style={{ display: "inline-block", borderRadius: 100, border: `2px solid ${PALETTE.accent}`, padding: "8px 20px", fontSize: "0.85rem", fontWeight: 700, color: PALETTE.accent, textDecoration: "none", whiteSpace: "nowrap" }}
              >
                En savoir plus →
              </Link>
            </div>
          </Reveal>

          {/* ── Bento grid ── */}
          {/*
            Desktop : 3 cols × 2 rows
            Col 1 (span 2 rows) : grande photo portrait
            Col 2 row 1 : Les séjours
            Col 3 row 1 : Réservation
            Col 2 row 2 : petite photo ambiance
            Col 3 row 2 : Aides + Travailler (2 sous-cellules empilées)
          */}
          <Reveal delay={0.04}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gridTemplateRows: "230px 230px",
              gap: 12,
            }}
              className="hidden md:grid"
            >
              {/* Grande photo portrait — col 1, rows 1-2 */}
              <div className="bento-photo" style={{ gridColumn: "1", gridRow: "1 / 3", borderRadius: 14, overflow: "hidden", position: "relative" }}>
                <Image
                  src="/banqueimage/portraits/portraits_001.jpg"
                  alt="My Creative Surf Camp"
                  fill
                  className="object-cover"
                  sizes="33vw"
                />
                <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 8, zIndex: 3 }}>
                  <a href="https://www.instagram.com/_colocrew/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="photo-social-link">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                      <circle cx="12" cy="12" r="4.2" />
                      <circle cx="17.8" cy="6.2" r="0.9" />
                    </svg>
                  </a>
                  <a href="https://www.tiktok.com/@colocrew" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="photo-social-link">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 4v9.3a3.8 3.8 0 1 1-3.8-3.8" />
                      <path d="M14 4c1.1 2 2.8 3.2 5 3.4" />
                    </svg>
                  </a>
                  <a href="https://www.facebook.com/profile.php?id=61571533102707" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="photo-social-link">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 8H17V4.5h-2.6C11.7 4.5 10 6.3 10 9.1V11H7v3.5h3V20h3.6v-5.5h2.8L17 11h-3.4V9.4c0-.9.3-1.4.9-1.4z" />
                    </svg>
                  </a>
                </div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 45%, rgba(36,23,61,0.72) 100%)" }} />
                <div style={{ position: "absolute", bottom: 18, left: 18, right: 18 }}>
                  <p style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 800, fontSize: "1.05rem", color: "#fff", lineHeight: 1.2 }}>My Creative Surf Camp</p>
                  <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>Ete 2025 · Bidart</p>
                </div>
              </div>

              {/* Les séjours — col 2, row 1 */}
              <Link href={BENTO_CARDS[0].href} className="bento-card" style={{ gridColumn: "2", gridRow: "1", borderRadius: 14, padding: "20px 22px", background: BENTO_CARDS[0].bg, border: `1px solid ${BENTO_CARDS[0].border}`, display: "flex", flexDirection: "column", justifyContent: "space-between", textDecoration: "none" }}>
                <div>
                  <h3 style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 800, fontSize: "1.22rem", color: PALETTE.text, lineHeight: 1.2 }}>{BENTO_CARDS[0].title}</h3>
                  <p style={{ marginTop: 9, fontSize: "0.88rem", color: PALETTE.textSoft, lineHeight: 1.56 }}>{BENTO_CARDS[0].body}</p>
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: PALETTE.accent, marginTop: 14 }}>Voir →</span>
              </Link>

              {/* Aides et financement — col 3, row 1 */}
              <Link href={BENTO_CARDS[1].href} className="bento-card" style={{ gridColumn: "3", gridRow: "1", borderRadius: 14, padding: "20px 22px", background: BENTO_CARDS[1].bg, border: `1px solid ${BENTO_CARDS[1].border}`, display: "flex", flexDirection: "column", justifyContent: "space-between", textDecoration: "none" }}>
                <div>
                  <h3 style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 800, fontSize: "1.22rem", color: PALETTE.text, lineHeight: 1.2 }}>{BENTO_CARDS[1].title}</h3>
                  <p style={{ marginTop: 9, fontSize: "0.88rem", color: PALETTE.textSoft, lineHeight: 1.56 }}>{BENTO_CARDS[1].body}</p>
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: PALETTE.accent, marginTop: 14 }}>Voir →</span>
              </Link>

              {/* Petite photo ambiance — col 2, row 2 */}
              <div className="bento-photo" style={{ gridColumn: "2", gridRow: "2", borderRadius: 14, overflow: "hidden", position: "relative" }}>
                <Image
                  src="/banqueimage/groupes/groupes_082.jpg"
                  alt="Ambiance ColoCrew"
                  fill
                  className="object-cover"
                  sizes="33vw"
                />
              </div>

              {/* Travailler avec nous — col 3, row 2 */}
              <Link href={BENTO_CARDS[2].href} className="bento-card" style={{ gridColumn: "3", gridRow: "2", borderRadius: 14, padding: "20px 22px", background: BENTO_CARDS[2].bg, border: `1px solid ${BENTO_CARDS[2].border}`, display: "flex", flexDirection: "column", justifyContent: "space-between", textDecoration: "none" }}>
                <div>
                  <h3 style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 800, fontSize: "1.22rem", color: PALETTE.text, lineHeight: 1.2 }}>{BENTO_CARDS[2].title}</h3>
                  <p style={{ marginTop: 9, fontSize: "0.88rem", color: PALETTE.textSoft, lineHeight: 1.56 }}>{BENTO_CARDS[2].body}</p>
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: PALETTE.accent, marginTop: 14 }}>Voir →</span>
              </Link>

            </div>

            {/* ── Mobile : stack vertical ── */}
            <div className="flex flex-col gap-3 md:hidden">
              <div className="bento-photo relative h-[220px] overflow-hidden rounded-[14px]">
                <Image src="/banqueimage/portraits/portraits_001.jpg" alt="ColoCrew" fill className="object-cover" sizes="100vw" />
                <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 8, zIndex: 3 }}>
                  <a href="https://www.instagram.com/_colocrew/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="photo-social-link">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                      <circle cx="12" cy="12" r="4.2" />
                      <circle cx="17.8" cy="6.2" r="0.9" />
                    </svg>
                  </a>
                  <a href="https://www.tiktok.com/@colocrew" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="photo-social-link">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 4v9.3a3.8 3.8 0 1 1-3.8-3.8" />
                      <path d="M14 4c1.1 2 2.8 3.2 5 3.4" />
                    </svg>
                  </a>
                  <a href="https://www.facebook.com/profile.php?id=61571533102707" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="photo-social-link">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 8H17V4.5h-2.6C11.7 4.5 10 6.3 10 9.1V11H7v3.5h3V20h3.6v-5.5h2.8L17 11h-3.4V9.4c0-.9.3-1.4.9-1.4z" />
                    </svg>
                  </a>
                </div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 40%, rgba(36,23,61,0.7) 100%)" }} />
                <div style={{ position: "absolute", bottom: 16, left: 16 }}>
                  <p style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 800, fontSize: "1rem", color: "#fff" }}>My Creative Surf Camp</p>
                  <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.75)", marginTop: 3 }}>Ete 2025 · Bidart</p>
                </div>
              </div>
              {BENTO_CARDS.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="bento-card"
                  style={{
                    borderRadius: 14,
                    padding: "20px 22px",
                    background: card.bg,
                    border: `1px solid ${card.border}`,
                    display: "block",
                    textDecoration: "none",
                    minHeight: 100,
                  }}
                >
                  <h3
                    style={{
                      fontFamily: '"Baloo 2", cursive',
                      fontWeight: 800,
                      fontSize: "1.12rem",
                      color: PALETTE.text,
                    }}
                  >
                    {card.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "0.84rem",
                      color: PALETTE.textSoft,
                      marginTop: 8,
                      lineHeight: 1.54,
                    }}
                  >
                    {card.body}
                  </p>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: PALETTE.accent,
                      marginTop: 10,
                      display: "block",
                    }}
                  >
                    Voir →
                  </span>
                </Link>
              ))}
            </div>
          </Reveal>

        </div>

        <Wave fill={PALETTE.blush} />
      </section>
    </>
  );
}

/* ─────────────────────────────────────────
   SECTION 4 — TÉMOIGNAGES (scroll horizontal)
   fond #fdf8f9 → vers blanc (#ffffff)
───────────────────────────────────────── */
function TestimonialsSection() {
  const scrollerRef = useRef(null);
  const [activeReview, setActiveReview] = useState(null);
  const loopTimerRef = useRef(null);
  const getReviewTitle = (review) => (review.type === "Enfant" ? "Avis jeune" : "Avis parent");
  const getReviewName = (review) => review?.displayName || review?.name || "";

  const duplicatedTestimonials = useMemo(
    () => [...homepageTestimonialsManual, ...homepageTestimonialsManual, ...homepageTestimonialsManual],
    []
  );

  const getScrollStep = () => {
    const node = scrollerRef.current;
    if (!node) return 0;
    const card = node.querySelector("[data-review-card]");
    if (!card) return 0;
    const style = window.getComputedStyle(node);
    const gap = parseFloat(style.gap || style.columnGap || "20") || 20;
    return card.getBoundingClientRect().width + gap;
  };

  const normalizeInfinitePosition = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const step = getScrollStep();
    if (!step) return;
    const blockWidth = homepageTestimonialsManual.length * step;
    if (node.scrollLeft < blockWidth * 0.45) {
      node.scrollLeft += blockWidth;
    } else if (node.scrollLeft > blockWidth * 2.55) {
      node.scrollLeft -= blockWidth;
    }
  };

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;

    const initPosition = () => {
      const step = getScrollStep();
      if (!step) return;
      node.scrollLeft = homepageTestimonialsManual.length * step;
    };

    initPosition();
    window.addEventListener("resize", initPosition);

    return () => {
      window.removeEventListener("resize", initPosition);
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
      }
    };
  }, []);

  const handleScroll = (direction) => {
    const node = scrollerRef.current;
    if (!node) return;
    const step = getScrollStep();
    if (!step) return;
    const amount = step;
    node.scrollBy({ left: direction * amount, behavior: "smooth" });

    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    loopTimerRef.current = setTimeout(() => {
      normalizeInfinitePosition();
    }, 420);
  };

  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: PALETTE.blush }}>
      <div className="pointer-events-none absolute -left-24 top-6 h-72 w-72 rounded-full bg-[#f3deea]/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-4 h-72 w-72 rounded-full bg-[#e8def9]/45 blur-3xl" />
      <div className="mx-auto w-full max-w-[1240px] px-5 pb-6 pt-14 md:px-8">
        <Reveal>
          <h2 style={{ fontFamily: "\"Baloo 2\", cursive", fontSize: "clamp(1.5rem, 2.8vw, 2.2rem)", fontWeight: 800, color: "#1f1640", marginBottom: 32, textAlign: "center" }}>
            Ce qu'ils en disent
          </h2>
        </Reveal>
      </div>

      <div className="relative w-full pb-1">
        <div
          className="pointer-events-none absolute bottom-8 left-0 top-0 z-10 w-16 md:w-24"
          style={{ background: "linear-gradient(90deg, rgba(253,247,251,0.95) 0%, rgba(253,247,251,0) 100%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-8 right-0 top-0 z-10 w-16 md:w-24"
          style={{ background: "linear-gradient(270deg, rgba(253,247,251,0.95) 0%, rgba(253,247,251,0) 100%)" }}
        />

        <button
          type="button"
          onClick={() => handleScroll(-1)}
          aria-label="Témoignages précédents"
          className="absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full px-3 py-2 text-[#2c2150] transition hover:bg-white/60 md:left-4"
          style={{
            backgroundColor: "rgba(255,255,255,0.38)",
            border: "1px solid rgba(255,255,255,0.58)",
            backdropFilter: "blur(6px)",
          }}
        >
          ‹
        </button>

        <div
          ref={scrollerRef}
          onScroll={() => {
            if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
            loopTimerRef.current = setTimeout(() => {
              normalizeInfinitePosition();
            }, 140);
          }}
          className="flex gap-5 overflow-x-auto px-2 pb-10 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-3"
          style={{
            scrollSnapType: "x mandatory",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            scrollBehavior: "smooth",
          }}
        >
          {duplicatedTestimonials.map((t, i) => (
            <button
              type="button"
              onClick={() => setActiveReview(t)}
              key={`${t.name}-${i}`}
              data-review-card
              style={{
                scrollSnapAlign: "start",
                flex: "0 0 min(360px, 86vw)",
                backgroundColor: "#ffffff",
                borderRadius: 20,
                padding: "24px 22px",
                boxShadow: "0 4px 24px rgba(184,51,106,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                textAlign: "left",
              }}
              className="cursor-pointer transition hover:-translate-y-0.5"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative" }}>
                  <Image
                    src={t.avatar}
                    alt={t.name}
                    fill
                    className="object-cover object-top"
                    sizes="56px"
                  />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1f1640" }}>{getReviewTitle(t)}</p>
                  <p style={{ fontSize: "0.86rem", color: "#2f2453", fontWeight: 700, marginTop: 1 }}>
                    {getReviewName(t)}
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "#6f648f", fontWeight: 600, marginTop: 1 }}>
                    {t.type}{t.period ? ` · ${t.period}` : ""}
                  </p>
                  <p style={{ fontSize: "0.78rem", color: PALETTE.accent, fontWeight: 700 }}>⭐ 10/10</p>
                </div>
              </div>

              <p style={{ fontSize: "0.9rem", color: "#4a3d6d", lineHeight: 1.6, fontStyle: "italic", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                "{t.excerpt}"
              </p>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => handleScroll(1)}
          aria-label="Témoignages suivants"
          className="absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-full px-3 py-2 text-[#2c2150] transition hover:bg-white/60 md:right-4"
          style={{
            backgroundColor: "rgba(255,255,255,0.38)",
            border: "1px solid rgba(255,255,255,0.58)",
            backdropFilter: "blur(6px)",
          }}
        >
          ›
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[1240px] justify-center px-5 pb-8 md:px-8">
        <Link
          href="/sejours/my-creative-surf-camp#avis-section"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#A45A86] underline-offset-4 transition hover:gap-3 hover:underline"
        >
          Voir plus d&apos;avis →
        </Link>
      </div>

      {activeReview ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer la modale"
            className="absolute inset-0 bg-[#120b23]/45"
            onClick={() => setActiveReview(null)}
          />
          <div className="relative z-[91] w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl md:p-8">
            <button
              type="button"
              onClick={() => setActiveReview(null)}
              className="absolute right-3 top-3 rounded-full px-2 py-1 text-sm text-[#4d3f74] hover:bg-[#f6effa]"
              aria-label="Fermer"
            >
              ✕
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 58, height: 58, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative" }}>
                <Image
                  src={activeReview.avatar}
                  alt={activeReview.name}
                  fill
                  className="object-cover object-top"
                  sizes="58px"
                />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1f1640" }}>{getReviewTitle(activeReview)}</p>
                <p style={{ fontSize: "0.9rem", color: "#2f2453", fontWeight: 700, marginTop: 1 }}>
                  {getReviewName(activeReview)}
                </p>
                <p style={{ fontSize: "0.8rem", color: "#6f648f", fontWeight: 600, marginTop: 2 }}>
                  {activeReview.type}{activeReview.period ? ` · ${activeReview.period}` : ""}
                </p>
                <p style={{ fontSize: "0.82rem", color: PALETTE.accent, fontWeight: 700 }}>⭐ 10/10</p>
              </div>
            </div>

            <p style={{ marginTop: 18, fontSize: "0.97rem", color: "#3f315f", lineHeight: 1.72, fontStyle: "italic", whiteSpace: "pre-line" }}>
              "{activeReview.fullText}"
            </p>
          </div>
        </div>
      ) : null}

      {/* Vague vers blanc blog */}
      <Wave fill={PALETTE.roseLight} />
    </section>
  );
}

/* ─────────────────────────────────────────
   SECTION 5 — ARTICLES DE BLOG
   fond blanc → vers #B8336A
───────────────────────────────────────── */
function BlogSection() {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: PALETTE.roseLight }}>
      <div className="pointer-events-none absolute -left-12 top-24 h-72 w-72 rounded-full bg-[#f1daea]/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-8 h-72 w-72 rounded-full bg-[#e5dcf7]/40 blur-3xl" />
      <div className="mx-auto w-full max-w-[1240px] px-5 py-14 md:px-8">
        <Reveal>
          <h2 style={{ fontFamily: "\"Baloo 2\", cursive", fontSize: "clamp(1.5rem, 2.8vw, 2.2rem)", fontWeight: 800, color: "#1f1640", marginBottom: 40, textAlign: "center" }}>
            Sur le blog
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {blogArticles.map((a, i) => (
            <Reveal key={a.title} delay={i * 0.08}>
              <article>
                {/* Image */}
                <div style={{ position: "relative", height: 200, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                  <Image
                    src={a.image}
                    alt={a.title}
                    fill
                    className="object-cover transition duration-500 hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>

                {/* Pill catégorie */}
                <span style={{ display: "inline-block", backgroundColor: "#f9e6f1", color: PALETTE.accent, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 12px", borderRadius: 100, marginBottom: 10 }}>
                  {a.category}
                </span>

                {/* Titre */}
                <h3 style={{ fontFamily: "\"Baloo 2\", cursive", fontWeight: 700, fontSize: "1rem", color: "#1f1640", lineHeight: 1.4, marginBottom: 8 }}>
                  {a.title}
                </h3>

                {/* Extrait */}
                <p style={{ fontSize: "0.875rem", color: "#5a5070", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 12 }}>
                  {a.excerpt}
                </p>

                {/* Lien */}
                <Link
                  href="/sejours"
                  style={{ fontSize: "0.875rem", fontWeight: 700, color: PALETTE.accent, textDecoration: "none" }}
                >
                  Lire l'article →
                </Link>
              </article>
            </Reveal>
          ))}
        </div>

        {/* Bouton centré */}
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <Link
            href="/sejours"
            style={{ display: "inline-block", border: `2px solid ${PALETTE.accent}`, color: PALETTE.accent, fontWeight: 700, fontSize: "0.9rem", padding: "12px 32px", borderRadius: 100, textDecoration: "none", transition: "all 0.2s" }}
            className="hover:bg-[#A45A86] hover:text-white"
          >
            Voir tous les articles
          </Link>
        </div>
      </div>

      {/* Vague vers CTA rose */}
      <Wave fill={PALETTE.rosePastel} />
    </section>
  );
}

/* ─────────────────────────────────────────
   SECTION 6 — BANNIÈRE CTA
   fond #B8336A → vers blanc (#ffffff)
───────────────────────────────────────── */
function CtaBanner() {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: PALETTE.rosePastel }}>
      <div className="pointer-events-none absolute -left-20 top-6 h-72 w-72 rounded-full bg-white/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-[#eadcf5]/45 blur-3xl" />
      <div className="mx-auto w-full max-w-[1240px] px-5 py-12 md:px-8 md:py-14">
        <Reveal>
          <h2
            style={{
              fontFamily: "\"Baloo 2\", cursive",
              fontWeight: 800,
              fontSize: "clamp(1.4rem, 2.8vw, 2.2rem)",
              color: PALETTE.text,
              marginBottom: 24,
              lineHeight: 1.2,
              textAlign: "center",
            }}
          >
            Nos partenaires
          </h2>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-10">
            <a
              href="https://totemia.com"
              target="_blank"
              rel="noopener noreferrer"
              title="Nos séjours de surf sont aussi disponibles chez Totemia !"
              className="rounded-2xl border border-white/35 bg-white/90 px-6 py-4 shadow-sm transition hover:opacity-90"
            >
              <img
                src="https://login.totemia.com/resources/ytrmc/login/totemia/img/logo.png"
                alt="Totemia Logo"
                className="h-auto w-44 object-contain md:w-52"
              />
            </a>

            <a
              href="https://juvigo.fr"
              target="_blank"
              rel="noopener noreferrer"
              title="Nos séjours de surf sont aussi disponibles chez Juvigo !"
              className="rounded-2xl border border-white/35 bg-white/90 px-6 py-4 shadow-sm transition hover:opacity-90"
            >
              <img
                src="https://juvigo.fr/assets/img/logo.png"
                alt="Juvigo Logo"
                className="h-auto w-40 object-contain md:w-48"
              />
            </a>

            <a
              href="https://bafa.murathenes.org"
              target="_blank"
              rel="noopener noreferrer"
              title="Découvre notre partenaire Murathènes pour passer ton BAFA"
              className="rounded-2xl border border-white/35 bg-white/90 px-6 py-4 shadow-sm transition hover:opacity-90"
            >
              <Image
                src="/bafa-murathenes.png"
                alt="Murathènes BAFA"
                width={266}
                height={60}
                className="h-auto w-44 object-contain md:w-52"
              />
            </a>
          </div>
        </Reveal>
      </div>

      {/* Vague vers blanc galerie */}
      <Wave fill={PALETTE.blush} />
    </section>
  );
}

/* ─────────────────────────────────────────
   SECTION 7 — GALERIE MASONRY 3 COL (6 photos)
   fond blanc → vers crème (#faf6f0)
───────────────────────────────────────── */
function GalerieSection() {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: PALETTE.blush }}>
      <div className="pointer-events-none absolute -left-16 top-10 h-64 w-64 rounded-full bg-[#f1d9e8]/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-14 bottom-8 h-64 w-64 rounded-full bg-[#e6dcf6]/35 blur-3xl" />
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-6 pb-12 md:px-8">
        {/* Grille 3 colonnes façon masonry avec hauteurs alternées */}
        <div
          style={{
            columns: "3",
            columnGap: "12px",
          }}
          className="max-md:!columns-2"
        >
          {galeriePhotos.map((src, i) => (
            <Reveal key={src} delay={i * 0.05} className="mb-3 block overflow-hidden rounded-xl">
              <div style={{ position: "relative", width: "100%", paddingBottom: i % 3 === 1 ? "130%" : "80%", breakInside: "avoid" }}>
                <Image
                  src={src}
                  alt="ColoCrew"
                  fill
                  className="object-cover transition duration-500 hover:scale-105"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
              </div>
            </Reveal>
          ))}
        </div>

        {/* Lien centré */}
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link
            href="/sejours"
            style={{ fontSize: "0.875rem", fontWeight: 700, color: PALETTE.accent, textDecoration: "none" }}
          >
            Voir plus de photos →
          </Link>
        </div>
      </div>

      {/* Vague vers footer */}
      <Wave fill="#ffffff" />
    </section>
  );
}

/* ─────────────────────────────────────────
   SECTION 8 — PROOF / INFOS PRATIQUES
   fond crème #faf6f0 → vers dark #1a0d2e
───────────────────────────────────────── */
function ProofSection() {
  return (
    <section style={{ backgroundColor: "#faf6f0", position: "relative", overflow: "hidden" }}>
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#f6e3ff]/60 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-16 h-72 w-72 rounded-full bg-[#ffe6d8]/50 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-[1240px] gap-6 px-5 pb-20 pt-4 md:grid-cols-[1.05fr_0.95fr] md:px-8">
        <Reveal className="relative min-h-[520px] overflow-hidden rounded-2xl shadow-xl md:min-h-[72vh]">
          <Image src="/banqueimage/plage/plage_004.jpg" alt={text.cta} fill className="object-cover" sizes="(max-width: 768px) 100vw, 55vw" />
          <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(17,11,35,0.06) 0%, rgba(17,11,35,0.82) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-7 text-center text-white">
            <p style={{ fontFamily: "\"Baloo 2\", cursive", fontWeight: 800, fontSize: "clamp(1.4rem, 2.8vw, 2.4rem)", lineHeight: 1.25 }}>{text.cta}</p>
          </div>
        </Reveal>

        <div className="space-y-4">
          {[
            { title: text.reservationTitle, body: text.reservationText, accent: "#B8336A" },
            { title: text.aidesTitle, body: text.aidesText, accent: "#7c3aed" },
            { title: text.workTitle, body: text.workText, accent: "#0ea5e9" },
          ].map((card, i) => (
            <Reveal key={card.title} delay={i * 0.07}>
              <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.8)", backgroundColor: "rgba(255,255,255,0.85)", padding: "20px 20px 20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", borderLeft: `4px solid ${card.accent}` }}>
                <p style={{ fontFamily: "\"Baloo 2\", cursive", fontWeight: 800, fontSize: "1.1rem", color: PALETTE.text }}>{card.title}</p>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.65, color: "#4f4567", marginTop: 8 }}>{card.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div className="relative mx-auto -mt-6 grid w-full max-w-[1240px] gap-4 px-5 pb-12 md:grid-cols-2 md:px-8">
        <Reveal className="relative min-h-[280px] overflow-hidden rounded-2xl shadow-md">
          <Image src="/banqueimage/portraits/portraits_064.jpg" alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
        </Reveal>
        <Reveal delay={0.08} className="relative min-h-[280px] overflow-hidden rounded-2xl shadow-md md:translate-y-6">
          <Image src="/banqueimage/portraits/portraits_065.jpg" alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
        </Reveal>
      </div>

      {/* Vague vers dark social */}
      <Wave fill="#1a0d2e" />
    </section>
  );
}

/* ─────────────────────────────────────────
   SECTION 9 — SOCIAL / CTA FINAL
   fond #1a0d2e → vers blanc footer
───────────────────────────────────────── */
function SocialSection() {
  return (
    <section style={{ backgroundColor: "#1a0d2e", position: "relative", overflow: "hidden" }}>
      {/* Photo fond */}
      <div style={{ position: "absolute", inset: 0 }}>
        <Image
          src="/banqueimage/plage/plage_003.jpg"
          alt=""
          fill
          className="object-cover"
          style={{ opacity: 0.2 }}
          aria-hidden="true"
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(26,13,46,0.88) 0%, rgba(184,51,106,0.18) 50%, rgba(26,13,46,0.92) 100%)" }} />
      </div>

      <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-[#B8336A]/20 blur-3xl" />
      <div className="pointer-events-none absolute left-6 bottom-6 h-72 w-72 rounded-full bg-[#7c3aed]/18 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-[1240px] gap-6 px-5 pt-10 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:pt-14">
        <Reveal className="relative min-h-[430px] overflow-hidden rounded-2xl shadow-xl md:min-h-[70vh]">
          <Image src="/banqueimage/groupes/groupes_058.jpg" alt={text.socialTitle} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
          <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(22,14,42,0.08) 0%, rgba(22,14,42,0.82) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-7 text-center text-white">
            <p style={{ fontFamily: "\"Baloo 2\", cursive", fontWeight: 800, fontSize: "clamp(1.4rem, 3vw, 2.6rem)" }}>{text.socialTitle}</p>
            <p style={{ maxWidth: 560, margin: "12px auto 0", fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.6 }}>{text.socialText}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              {[
                { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61571533102707" },
                { label: "Instagram", href: "https://www.instagram.com/_colocrew/" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ border: "1px solid rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.1)", padding: "6px 16px", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.1em", color: "#fff", textDecoration: "none", borderRadius: 6 }}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="flex flex-col gap-5">
          <Reveal className="relative min-h-[206px] overflow-hidden rounded-2xl shadow-md">
            <Image src="/banqueimage/surf/surf_002.jpg" alt="" fill className="object-cover" sizes="50vw" />
          </Reveal>
          <Reveal delay={0.08} className="relative min-h-[206px] overflow-hidden rounded-2xl shadow-md">
            <Image src="/banqueimage/surf/surf_003.jpg" alt="" fill className="object-cover" sizes="50vw" />
          </Reveal>
          <Reveal delay={0.14}>
            <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.07)", padding: 24, textAlign: "center", backdropFilter: "blur(8px)" }}>
              <p style={{ fontFamily: "\"Baloo 2\", cursive", fontWeight: 800, fontSize: "clamp(1.2rem, 2.5vw, 1.8rem)", color: "#ffffff" }}>{text.cta}</p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20 }}>
                <Link
                  href="/reservation"
                  style={{ border: "1px solid #c13871", padding: "8px 16px", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.11em", color: "#c13871", textDecoration: "none", borderRadius: 6 }}
                >
                  {text.reservationTitle}
                </Link>
                <Link
                  href="/sejours"
                  style={{ backgroundColor: "#c13871", padding: "8px 16px", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.11em", color: "#fff", textDecoration: "none", borderRadius: 6 }}
                >
                  {text.sejoursTextA}
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Vague vers blanc footer */}
      <div style={{ paddingBottom: 60 }}>
        <Wave fill="#ffffff" />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────
   EXPORT
───────────────────────────────────────── */
export default function Home2026() {
  return (
    <div style={{ backgroundColor: "#ffffff", color: PALETTE.text }}>
      <Hero />
      <FeaturesAndTrips />
      <StreamSection />
      <TestimonialsSection />
      <BlogSection />
      <CtaBanner />
      <GalerieSection />
    </div>
  );
}





