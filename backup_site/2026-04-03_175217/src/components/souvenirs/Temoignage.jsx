"use client";

import styles from "@/src/pages/Souvenirs/SouvenirArticle.module.css";
import useReveal from "./useReveal";

export default function Temoignage({ temoignage, accent, bg, highlighted = false, index = 0 }) {
  const { ref, visible } = useReveal(0.2);

  const authorSuffix = temoignage.type === "jeune" && temoignage.age ? `, ${temoignage.age}` : "";
  const typeLabel = temoignage.type === "parent" ? "Parent" : "Jeune";

  return (
    <article
      ref={ref}
      className={`${styles.testimonialCard} ${highlighted ? styles.testimonialFeatured : ""} ${styles.stagger} ${
        visible ? styles.staggerVisible : ""
      }`.trim()}
      style={{ "--accent": accent, "--bg": bg, "--i": index }}
    >
      <p className={styles.quoteMark}>“</p>
      <p className={styles.testimonialText}>{temoignage.texte}</p>
      <div className={styles.testimonialDivider} />

      <div className={styles.testimonialFooter}>
        <p className={styles.testimonialAuthor}>
          {temoignage.auteur}
          {authorSuffix} · {typeLabel}
        </p>

        {temoignage.note !== null && temoignage.note !== undefined ? (
          <span className={styles.noteBadge}>★ {temoignage.note}/10</span>
        ) : null}
      </div>
    </article>
  );
}
