import Image from "next/image";
import Link from "next/link";
import {
  FaArrowRight,
  FaExternalLinkAlt,
  FaFacebookF,
  FaInstagram,
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
  const ways = [
    { title: "Donner du temps", meta: "Selon vos disponibilités", text: "Préparer les séjours, suivre les inscriptions ou participer au fonctionnement de l’association.", href: "#rejoindre", action: "Remplir le formulaire" },
    { title: "Adhérer à l’association", meta: "Prix libre", text: "Devenir membre de ColoCrew et soutenir les activités de l’association.", href: HELLOASSO_MEMBERSHIP_URL, external: true, action: "Adhérer sur HelloAsso" },
    { title: "Commander un tee-shirt", meta: "Dès " + merchStartingPrice() + " €", text: "Les tee-shirts ColoCrew sont disponibles en ligne. Livraison " + MERCH_SHIPPING.delay + ", " + MERCH_SHIPPING.amount + " € de port.", href: "/merch", action: "Voir les tee-shirts" },
  ];
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{edito.eyebrow} <span>· {edito.dateLabel}</span></p>
            <h1>{edito.title}</h1>
            <p className={styles.chapo}>{edito.chapo}</p>
          </div>
          <div className={styles.heroPhotos} aria-label="L’équipe en images">
            {[edito.heroImage, edito.heroImageSecond].map((photo, index) => (
              <figure key={photo.src} className={styles.heroPhoto}>
                <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height}
                  priority={index === 0} sizes="(max-width: 640px) 45vw, 280px" />
              </figure>
            ))}
          </div>
        </header>

        <section className={styles.participation} aria-label="Participer au projet ColoCrew">
          <VolunteerForm />
        </section>

        <section className={styles.support} aria-labelledby="support-title">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Soutenir ColoCrew</p>
            <h2 id="support-title">Trois manières de participer</h2>
          </div>
          <div className={styles.waysGrid}>
            {ways.map((way, index) => (
              <article key={way.href} className={styles.way}>
                <span className={styles.wayNumber}>0{index + 1}</span>
                <h3>{way.title}</h3>
                <span className={styles.wayMeta}>{way.meta}</span>
                <p>{way.text}</p>
                {way.external ? (
                  <a className={styles.wayLink} href={way.href} target="_blank" rel="noreferrer">{way.action} <FaExternalLinkAlt aria-hidden="true" /></a>
                ) : (
                  <Link className={styles.wayLink} href={way.href}>{way.action} <FaArrowRight aria-hidden="true" /></Link>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.missions} aria-labelledby="missions-title">
          <div className={styles.sectionHead}>
            <h2 id="missions-title">Les missions, plus en détail</h2>
            <p>Quelques exemples de tâches au sein de l’association.</p>
          </div>
          <div className={styles.missionList}>
            {edito.missions.map((mission) => (
              <details key={mission.id} className={styles.mission}>
                <summary>{mission.title}<span className={styles.expand} aria-hidden="true" /></summary>
                <div className={styles.missionDetails}>
                  <p>{mission.lead}</p>
                  <ul>{mission.points.map((point) => <li key={point}>{point}</li>)}</ul>
                </div>
              </details>
            ))}
          </div>
        </section>

        {edito.article.length > 0 && (
          <section id="edito" className={styles.articleSection}>
            <article className={styles.article}>
              {edito.article.map((block, index) => <ArticleBlock key={index} block={block} />)}
              <p className={styles.signature}>{edito.signature}</p>
            </article>
          </section>
        )}

        <div className={styles.socials}>
          <span>Suivre les nouvelles de l’association</span>
          <div>{edito.socials.map((social) => (
            <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label}>
              {SOCIAL_ICONS[social.label]}
            </a>
          ))}</div>
        </div>
      </div>
    </div>
  );
}
