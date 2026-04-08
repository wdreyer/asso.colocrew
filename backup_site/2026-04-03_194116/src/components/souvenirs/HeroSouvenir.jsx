import Link from "next/link";
import styles from "@/src/pages/Souvenirs/SouvenirArticle.module.css";
import StatsBadge from "./StatsBadge";
import SmartImage from "./SmartImage";

export default function HeroSouvenir({ souvenir }) {
  return (
    <>
      <header className={styles.hero}>
        <SmartImage src={souvenir.hero?.src} alt={souvenir.hero?.alt || souvenir.titre} className={styles.heroImage} />
        <div className={styles.heroOverlay} />

        <div className={styles.breadcrumb}>
          <Link href="/souvenirs" className="underline underline-offset-2">
            Souvenirs
          </Link>
          <span> / </span>
          <span>{souvenir.saison}</span>
        </div>

        <div className={styles.heroContent}>
          <span className={styles.saisonBadge}>{souvenir.saison}</span>
          <h1 className={styles.heroTitle}>{souvenir.titre}</h1>
          <p className={styles.heroMeta}>
            {souvenir.dates} — {souvenir.lieu}
          </p>

          <div className={styles.statsRow}>
            <StatsBadge value={souvenir.stats.jeunes} label="jeunes" showDot />
            <StatsBadge value={souvenir.stats.jours} label="jours" showDot />
            <StatsBadge
              value={String(souvenir.stats.note_moyenne).replace(".", ",")}
              label="/ 10"
            />
          </div>
        </div>
      </header>

      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className={styles.heroWave}>
        <path
          d="M0,86L72,80C144,74,288,62,432,52C576,42,720,34,864,40C1008,46,1152,66,1296,74C1368,78,1404,80,1440,82L1440,120L0,120Z"
          fill={souvenir.couleur_bg}
        />
        <path
          d="M0,98L80,90C160,82,320,66,480,60C640,54,800,58,960,66C1120,74,1280,86,1360,92L1440,98L1440,120L0,120Z"
          fill={souvenir.couleur_bg}
          fillOpacity="0.72"
        />
      </svg>
    </>
  );
}
