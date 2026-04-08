"use client";

import { useEffect } from "react";
import styles from "@/src/pages/Souvenirs/SouvenirArticle.module.css";
import SmartImage from "./SmartImage";

export default function Lightbox({ photos, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const photo = photos[index];
  if (!photo) return null;

  return (
    <div className={styles.lightboxOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <button className={styles.lbClose} onClick={onClose} aria-label="Fermer la galerie">
        ×
      </button>

      <div className={styles.lightboxContent} onClick={(event) => event.stopPropagation()}>
        <button className={`${styles.lbBtn} ${styles.lbPrev}`} onClick={onPrev} aria-label="Photo précédente">
          ‹
        </button>

        <div className={styles.lightboxImgWrap}>
          <SmartImage src={photo.src} alt={photo.alt} className={styles.lightboxImg} />
        </div>

        <button className={`${styles.lbBtn} ${styles.lbNext}`} onClick={onNext} aria-label="Photo suivante">
          ›
        </button>

        <p className={styles.lightboxCaption}>{photo.legende || photo.alt || ""}</p>
      </div>
    </div>
  );
}
