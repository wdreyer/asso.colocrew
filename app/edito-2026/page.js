import Image from "next/image";
import Link from "next/link";
import { FaArrowRight, FaHeart, FaTshirt } from "react-icons/fa";
import { EDITO_2026 } from "@/src/content/edito2026";
import { HELLOASSO_MEMBERSHIP_URL } from "@/src/lib/volunteers";
import { MERCH_SHIPPING, merchStartingPrice } from "@/src/lib/merchConfig";
import VolunteerForm from "./VolunteerForm";
import MissionButton from "./MissionButton";
import styles from "./edito.module.css";

export const metadata = {
  title: "Édito 2026 - ColoCrew",
  description: "Le mot de l'équipe ColoCrew sur 2026, et comment nous aider à préparer 2027 : bénévolat, adhésion, tee-shirt.",
  alternates: { canonical: "https://www.colocrew.com/edito-2026" },
  robots: EDITO_2026.draft ? { index: false, follow: false } : undefined,
  openGraph: {
    title: "Édito 2026 - ColoCrew",
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
  return (
    <div className={styles.page}>
      {/* ── En haut : l'édito à gauche, le formulaire à droite ── */}
      <section className={styles.top}>
        <div className={styles.topInner}>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>{edito.eyebrow}</p>
            <h1>{edito.title}</h1>
            <p className={styles.chapo}>{edito.chapo}</p>
            <p className={styles.byline}>{edito.signature} · {edito.dateLabel}</p>
            <nav className={styles.quickLinks} aria-label="Comment nous aider">
              <a href="#rejoindre">Donner du temps</a>
              <a href="#soutenir">Adhérer</a>
              <a href="#soutenir">Porter le tee-shirt</a>
              <a href="#edito">Lire l&apos;édito</a>
            </nav>
          </div>
          <div className={styles.heroPhoto}>
            <Image src={edito.heroImage.src} alt={edito.heroImage.alt} fill priority sizes="(max-width: 960px) 100vw, 50vw" />
          </div>
        </div>
        <div className={styles.formWrap}>
          <VolunteerForm />
        </div>
      </section>

      {/* ── Pas disponible ? ── */}
      <section id="soutenir" className={styles.support}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Pas le temps en ce moment ?</p>
          <h2>Tu peux quand même nous aider</h2>
        </div>
        <div className={styles.supportGrid}>
          <article className={styles.supportCard}>
            <span className={styles.supportIcon} aria-hidden="true"><FaHeart /></span>
            <h3>Adhérer à l&apos;association</h3>
            <p>
              L&apos;adhésion est à <strong>prix libre</strong>. Elle compte pour nous : plus on a d&apos;adhérents,
              plus on pèse auprès des partenaires. Et tu reçois nos actualités.
            </p>
            <a className={styles.supportLink} href={HELLOASSO_MEMBERSHIP_URL} target="_blank" rel="noreferrer">
              J&apos;adhère sur HelloAsso <FaArrowRight />
            </a>
          </article>
          <article className={`${styles.supportCard} ${styles.supportCardPhoto}`}>
            <div className={styles.supportPhoto}>
              <Image src="/images/merch/crew-front-group.jpeg" alt="L'équipe ColoCrew en tee-shirts rouges et blancs" fill sizes="(max-width: 760px) 100vw, 40vw" />
            </div>
            <div className={styles.supportBody}>
              <span className={styles.supportIcon} aria-hidden="true"><FaTshirt /></span>
              <h3>Commander un tee-shirt</h3>
              <p>
                Rouge ou blanc, à partir de {merchStartingPrice()} €. Livré chez toi sous une semaine,
                {` ${MERCH_SHIPPING.amount} €`} de frais de port.
              </p>
              <Link className={styles.supportLink} href="/merch">Voir les tee-shirts <FaArrowRight /></Link>
            </div>
          </article>
        </div>
      </section>

      {/* ── L'édito ── */}
      <section id="edito" className={styles.articleSection}>
        <article className={styles.article}>
          <p className={styles.eyebrow}>L&apos;édito</p>
          {edito.article.map((block, index) => <ArticleBlock key={index} block={block} />)}
          <p className={styles.signature}>{edito.signature}</p>
        </article>
      </section>

      {/* ── L'équipe ── */}
      <section className={styles.teamBand} aria-label="L'équipe ColoCrew">
        {edito.teamPhotos.map((photo) => (
          <figure key={photo.src} className={styles.teamPhoto}>
            <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 760px) 100vw, 33vw" />
          </figure>
        ))}
      </section>

      {/* ── Comment nous aider ── */}
      <section id="missions" className={styles.missions}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Comment nous aider</p>
          <h2>Quatre façons de donner un coup de main</h2>
          <p>Choisis ce qui te ressemble. On s&apos;adapte à ton temps et on t&apos;accompagne au début.</p>
        </div>
        <div className={styles.missionGrid}>
          {edito.missions.map((mission, index) => (
            <article key={mission.id} className={styles.missionCard}>
              <span className={styles.missionNumber}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{mission.title}</h3>
              <p className={styles.missionLead}>{mission.lead}</p>
              <ul>
                {mission.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <MissionButton interests={mission.interests} />
            </article>
          ))}
        </div>
      </section>

      {/* ── Fin de page ── */}
      <section className={styles.closing}>
        <h2>Une demi-journée par mois, c&apos;est déjà beaucoup.</h2>
        <p>Chaque coup de main permet à plus de jeunes de partir.</p>
        <div className={styles.closingActions}>
          <a className={styles.closingPrimary} href="#rejoindre">Je me propose <FaArrowRight /></a>
          <a className={styles.closingSecondary} href={HELLOASSO_MEMBERSHIP_URL} target="_blank" rel="noreferrer">J&apos;adhère</a>
        </div>
      </section>
    </div>
  );
}
