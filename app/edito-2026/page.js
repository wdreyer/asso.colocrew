import Image from "next/image";
import Link from "next/link";
import {
  FaArrowRight,
  FaExternalLinkAlt,
  FaFacebookF,
  FaInstagram,
  FaPenNib,
  FaTiktok,
} from "react-icons/fa";
import { EDITO_2026 } from "@/src/content/edito2026";
import { HELLOASSO_MEMBERSHIP_URL } from "@/src/lib/volunteers";
import { MERCH_SHIPPING, merchStartingPrice } from "@/src/lib/merchConfig";
import VolunteerForm from "./VolunteerForm";
import styles from "./edito.module.css";

const SOCIAL_ICONS = { Instagram: <FaInstagram />, TikTok: <FaTiktok />, Facebook: <FaFacebookF /> };

export const metadata = {
  title: "Bilan de l'été 2026 - ColoCrew",
  description: "Le mot de l'équipe ColoCrew après l'été 2026, et comment nous aider à continuer : bénévolat, adhésion, tee-shirt.",
  alternates: { canonical: "https://www.colocrew.com/edito-2026" },
  robots: EDITO_2026.draft ? { index: false, follow: false } : undefined,
  openGraph: {
    title: "Bilan de l'été 2026 - ColoCrew",
    description: "Comment nous aider à préparer 2027 : bénévolat, adhésion, tee-shirt.",
    url: "https://www.colocrew.com/edito-2026",
    images: [{ url: `https://www.colocrew.com${EDITO_2026.heroImage.src}` }],
  },
};

/** "**gras**" → <strong>gras</strong> */
function RichText({ text }) {
  return String(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) => (part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part));
}

function ArticleBlock({ block }) {
  if (block.type === "h2") return <h2>{block.text}</h2>;
  if (block.type === "quote") {
    return (
      <figure className={styles.quote}>
        <blockquote>{block.text}</blockquote>
        {block.author ? <figcaption>{block.author}</figcaption> : null}
      </figure>
    );
  }
  if (block.type === "list") {
    return <ul>{block.items.map((item) => <li key={item}><RichText text={item} /></li>)}</ul>;
  }
  return <p><RichText text={block.text} /></p>;
}

export default function Edito2026Page() {
  const edito = EDITO_2026;

  // Les trois façons d'aider, visibles dès l'ouverture de la page.
  const ways = [
    {
      key: "temps",
      href: "#rejoindre",
      title: "Participer aux activités",
      meta: "Bénévolat",
      text: "Séjours, inscriptions, administratif ou CA.",
    },
    {
      key: "adherer",
      href: HELLOASSO_MEMBERSHIP_URL,
      external: true,
      title: "Adhérer",
      meta: "Prix libre",
      text: "Devenir membre de l’association.",
    },
    {
      key: "tee",
      href: "/merch",
      title: "Commander un tee-shirt",
      meta: `Dès ${merchStartingPrice()} €`,
      text: `Livré ${MERCH_SHIPPING.delay}, ${MERCH_SHIPPING.amount} € de port.`,
    },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.top}>
        {/* ── Introduction et photos ── */}
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{edito.eyebrow}</p>
            <h1>{edito.title}</h1>
            <p className={styles.chapo}>{edito.chapo}</p>
            <div className={styles.socials}>
              <span>Nous suivre</span>
              {edito.socials.map((social) => (
                <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} title={social.label}>
                  {SOCIAL_ICONS[social.label]}
                </a>
              ))}
            </div>
          </div>

          <div className={styles.heroPhotos}>
            {[edito.heroImage, edito.heroImageSecond].map((photo, index) => (
              <figure key={photo.src} className={styles.heroPhoto}>
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.width}
                  height={photo.height}
                  priority={index === 0}
                  sizes="(max-width: 640px) calc(100vw - 28px), (max-width: 1160px) 52vw, 585px"
                />
              </figure>
            ))}
          </div>
        </div>

        {/* ── Les 3 façons d'aider ── */}
        <nav className={styles.ways} aria-label="Comment nous aider">
          <p className={styles.waysTitle}>Participer à la vie de l’association</p>
          <div className={styles.waysGrid}>
            {ways.map((way) => {
              const content = (
                <>
                  <span className={styles.wayBody}>
                    <strong>{way.title}</strong>
                    <span className={styles.wayMeta}>{way.meta}</span>
                    <span className={styles.wayText}>{way.text}</span>
                  </span>
                  <span className={styles.wayArrow} aria-hidden="true">{way.external ? <FaExternalLinkAlt /> : <FaArrowRight />}</span>
                </>
              );
              const className = styles.way;
              if (way.external) {
                return <a key={way.key} href={way.href} target="_blank" rel="noreferrer" className={className}>{content}</a>;
              }
              if (way.href.startsWith("#")) {
                return <a key={way.key} href={way.href} className={className}>{content}</a>;
              }
              return <Link key={way.key} href={way.href} className={className}>{content}</Link>;
            })}
          </div>
        </nav>
      </section>

      {/* ── Les missions, en bref ── */}
      <section id="missions" className={styles.missions}>
        <div className={styles.sectionHead}>
          <h2>Les missions de l’association</h2>
          <p>Les besoins concernent la préparation des séjours et le fonctionnement de l’association.</p>
        </div>
        <div className={styles.missionGrid}>
          {edito.missions.map((mission) => (
            <article key={mission.id} className={styles.missionCard}>
              <div className={styles.missionHead}>
                <h3>{mission.title}</h3>
              </div>
              <div className={styles.missionDetails}>
                <p className={styles.missionLead}>{mission.lead}</p>
                <ul>
                  {mission.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.participation} aria-label="Proposer une participation">
        <div className={styles.formWrap}>
          <VolunteerForm />
        </div>
      </section>

      {/* ── L'édito ── */}
      <section id="edito" className={styles.articleSection}>
        {edito.article.length ? (
          <article className={styles.article}>
            <p className={styles.eyebrow}>L&apos;édito · {edito.dateLabel}</p>
            {edito.article.map((block, index) => <ArticleBlock key={index} block={block} />)}
            <p className={styles.signature}>{edito.signature}</p>
          </article>
        ) : (
          <div className={styles.editoPending}>
            <FaPenNib aria-hidden="true" />
            <p>Édito en cours d&apos;écriture</p>
          </div>
        )}
      </section>

    </div>
  );
}
