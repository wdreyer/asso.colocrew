import Image from "next/image";
import Link from "next/link";
import {
  FaArrowRight,
  FaClock,
  FaEnvelope,
  FaExternalLinkAlt,
  FaFacebookF,
  FaHeart,
  FaInstagram,
  FaPenNib,
  FaPhoneAlt,
  FaTiktok,
  FaTshirt,
} from "react-icons/fa";
import { EDITO_2026 } from "@/src/content/edito2026";
import { HELLOASSO_MEMBERSHIP_URL } from "@/src/lib/volunteers";
import { MERCH_SHIPPING, merchStartingPrice } from "@/src/lib/merchConfig";
import VolunteerForm from "./VolunteerForm";
import MissionButton from "./MissionButton";
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
  const contact = edito.contact;

  // Les trois façons d'aider, visibles dès l'ouverture de la page.
  const ways = [
    {
      key: "temps",
      href: "#rejoindre",
      icon: <FaClock />,
      title: "Donner du temps",
      meta: "Bénévolat · 2 min",
      text: "Séjours, inscriptions, administratif ou CA.",
      primary: true,
    },
    {
      key: "adherer",
      href: HELLOASSO_MEMBERSHIP_URL,
      external: true,
      icon: <FaHeart />,
      title: "Adhérer",
      meta: "Prix libre",
      text: "Tu reçois nos actus, et l'asso pèse plus.",
    },
    {
      key: "tee",
      href: "/merch",
      icon: <FaTshirt />,
      title: "Porter le tee-shirt",
      meta: `Dès ${merchStartingPrice()} €`,
      text: `Livré ${MERCH_SHIPPING.delay}, ${MERCH_SHIPPING.amount} € de port.`,
    },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.top}>
        {/* ── En-tête compact ── */}
        <div className={styles.hero}>
          <div className={styles.heroPhoto}>
            <Image src={edito.heroImage.src} alt={edito.heroImage.alt} fill priority sizes="(max-width: 860px) 100vw, 46vw" />
          </div>
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
        </div>

        {/* ── Les 3 façons d'aider ── */}
        <nav className={styles.ways} aria-label="Comment nous aider">
          <p className={styles.waysTitle}>Comment veux-tu nous aider ?</p>
          <div className={styles.waysGrid}>
            {ways.map((way) => {
              const content = (
                <>
                  <span className={styles.wayIcon} aria-hidden="true">{way.icon}</span>
                  <span className={styles.wayBody}>
                    <strong>{way.title}</strong>
                    <span className={styles.wayMeta}>{way.meta}</span>
                    <span className={styles.wayText}>{way.text}</span>
                  </span>
                  <span className={styles.wayArrow} aria-hidden="true">{way.external ? <FaExternalLinkAlt /> : <FaArrowRight />}</span>
                </>
              );
              const className = `${styles.way} ${way.primary ? styles.wayPrimary : ""}`;
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

        {/* ── Formulaire + contact ── */}
        <div className={styles.formWrap}>
          <VolunteerForm />
          <aside className={styles.contact}>
            <div className={styles.contactPhoto}>
              <Image src={contact.photo} alt={contact.photoAlt} fill sizes="(max-width: 640px) 100vw, 220px" />
            </div>
            <div className={styles.contactText}>
              <strong>{contact.name}</strong>
              <span className={styles.contactRole}>{contact.role}</span>
              <p>{contact.text}</p>
            </div>
            <div className={styles.contactActions}>
              <a href={`mailto:${contact.email}`}><FaEnvelope /> {contact.email}</a>
              <a href={`tel:${contact.phone.replace(/\s/g, "")}`}><FaPhoneAlt /> {contact.phone}</a>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Les missions, en bref ── */}
      <section id="missions" className={styles.missions}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Donner du temps</p>
          <h2>Ce que tu peux faire avec nous</h2>
          <p>On s&apos;adapte à ton temps et on t&apos;accompagne au début.</p>
        </div>
        <div className={styles.missionGrid}>
          {edito.missions.map((mission, index) => (
            <article key={mission.id} className={styles.missionCard}>
              <div className={styles.missionHead}>
                <span className={styles.missionNumber}>{String(index + 1).padStart(2, "0")}</span>
                <h3>{mission.title}</h3>
              </div>
              <p className={styles.missionLead}>{mission.lead}</p>
              <ul>
                {mission.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <MissionButton interests={mission.interests} />
            </article>
          ))}
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

      {/* ── Rappel final ── */}
      <section className={styles.closing}>
        <h2>Une demi-journée par mois, c&apos;est déjà beaucoup.</h2>
        <div className={styles.closingActions}>
          <a className={styles.closingPrimary} href="#rejoindre">Je donne du temps <FaArrowRight /></a>
          <a className={styles.closingSecondary} href={HELLOASSO_MEMBERSHIP_URL} target="_blank" rel="noreferrer">J&apos;adhère</a>
          <Link className={styles.closingSecondary} href="/merch">Le tee-shirt</Link>
        </div>
      </section>
    </div>
  );
}
