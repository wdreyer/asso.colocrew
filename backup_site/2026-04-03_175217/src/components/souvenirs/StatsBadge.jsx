import styles from "@/src/pages/Souvenirs/SouvenirArticle.module.css";

export default function StatsBadge({ value, label, showDot = false }) {
  return (
    <>
      <div className={styles.statBadge}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
      {showDot ? <span className={styles.statsDot}>·</span> : null}
    </>
  );
}
