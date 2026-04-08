import Link from "next/link";
import { SOUVENIRS } from "@/src/data/souvenirs";
import styles from "./SouvenirArticle.module.css";
import SmartImage from "@/src/components/souvenirs/SmartImage";

export default function SouvenirsIndexPage() {
  return (
    <main className={styles.indexPage}>
      <div className={styles.indexInner}>
        <h1 className={styles.indexTitle}>Souvenirs</h1>
        <p className={styles.indexSub}>
          Deux récits immersifs pour revivre les séjours ColoCrew, entre progression, collectif et créations partagées.
        </p>

        <section className={styles.cardsGrid}>
          {SOUVENIRS.map((item) => (
            <Link key={item.slug} href={`/souvenirs/${item.slug}`} className={styles.souvenirCard}>
              <article>
                <div className={styles.souvenirMedia}>
                  <SmartImage src={item.hero?.src} alt={item.hero?.alt || item.titre} className={styles.mediaImg} />
                  <div className={styles.souvenirOverlay} />
                  <span className={styles.souvenirBadge}>{item.saison}</span>

                  <div className={styles.souvenirMeta}>
                    <h2 className={styles.souvenirTitle}>{item.titre}</h2>
                    <p className={styles.souvenirLieu}>{item.lieu}</p>
                  </div>
                </div>

                <div className={styles.souvenirBody}>
                  <p className={styles.souvenirIntro}>{item.intro}</p>
                  <div className={styles.souvenirStatsRow}>
                    <span className={styles.souvenirStat}>{item.stats.jeunes} jeunes</span>
                    <span className={styles.souvenirStat}>{item.stats.jours} jours</span>
                    <span className={styles.souvenirStat}>{String(item.stats.note_moyenne).replace(".", ",")} / 10</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
