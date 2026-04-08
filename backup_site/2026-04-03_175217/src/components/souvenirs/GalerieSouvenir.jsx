"use client";

import { useMemo, useState } from "react";
import styles from "@/src/pages/Souvenirs/SouvenirArticle.module.css";
import Lightbox from "./Lightbox";
import SmartImage from "./SmartImage";
import useReveal from "./useReveal";

export default function GalerieSouvenir({ photos = [], accent, bg }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const reveal = useReveal(0.15);

  const normalized = useMemo(() => photos.filter(Boolean), [photos]);

  const openAt = (index) => setActiveIndex(index);
  const close = () => setActiveIndex(null);
  const prev = () => setActiveIndex((value) => (value - 1 + normalized.length) % normalized.length);
  const next = () => setActiveIndex((value) => (value + 1) % normalized.length);

  return (
    <section className={styles.gallerySection} style={{ "--accent": accent, "--bg": bg }}>
      <h2 className={styles.sectionTitle}>En images</h2>

      <div
        ref={reveal.ref}
        className={`${styles.galleryGrid} ${styles.fadeIn} ${reveal.visible ? styles.fadeInVisible : ""}`.trim()}
      >
        {normalized.map((item, index) => (
          <button
            key={`${item.src}-${index}`}
            type="button"
            className={`${styles.galleryItem} ${item.orientation === "portrait" ? styles.galleryItemPortrait : ""}`.trim()}
            onClick={() => openAt(index)}
            aria-label={`Ouvrir l'image ${index + 1}`}
          >
            <SmartImage src={item.src} alt={item.alt} className={styles.mediaImg} />
            {item.legende ? <span className={styles.galleryCaption}>{item.legende}</span> : null}
          </button>
        ))}
      </div>

      {activeIndex !== null ? (
        <Lightbox photos={normalized} index={activeIndex} onClose={close} onPrev={prev} onNext={next} />
      ) : null}
    </section>
  );
}
