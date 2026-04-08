"use client";

import styles from "@/src/pages/Souvenirs/SouvenirArticle.module.css";
import SmartImage from "./SmartImage";
import useReveal from "./useReveal";

function Paragraphs({ text }) {
  const paragraphs = String(text || "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className={styles.prose}>
      {paragraphs.map((paragraph, idx) => (
        <p key={`${paragraph.slice(0, 16)}-${idx}`}>{paragraph}</p>
      ))}
    </div>
  );
}

export default function Chapitre({ chapitre, accent, isLast = false }) {
  const titleReveal = useReveal(0.2);
  const imageReveal = useReveal(0.2);
  const textReveal = useReveal(0.15);

  const position = chapitre?.photo?.position || null;
  const hasPhoto = Boolean(chapitre?.photo?.src || chapitre?.photo);

  const chapterStyle = { "--accent": accent };

  return (
    <section className={styles.chapter} style={chapterStyle} id={chapitre.id}>
      <div
        ref={titleReveal.ref}
        className={`${styles.chapterHeader} ${styles.reveal} ${titleReveal.visible ? styles.revealVisible : ""}`.trim()}
      >
        <h2 className={styles.chapterTitle}>{chapitre.titre}</h2>
        <div className={styles.chapterRule} />
      </div>

      {position === "full" && hasPhoto ? (
        <div className={styles.fullImageWrap}>
          <p className={styles.fullImageLead}>Un moment clé de cette étape du séjour :</p>
          <figure
            ref={imageReveal.ref}
            className={`${styles.mediaBlock} ${styles.fadeIn} ${imageReveal.visible ? styles.fadeInVisible : ""}`.trim()}
          >
            <div className={styles.mediaFrame}>
              <SmartImage src={chapitre.photo.src} alt={chapitre.photo.alt} className={styles.mediaImg} />
            </div>
            {chapitre.photo.legende ? <figcaption className={styles.mediaCaption}>{chapitre.photo.legende}</figcaption> : null}
          </figure>

          <div
            ref={textReveal.ref}
            className={`${styles.reveal} ${textReveal.visible ? styles.revealVisible : ""}`.trim()}
          >
            <Paragraphs text={chapitre.texte} />
          </div>
        </div>
      ) : hasPhoto && (position === "right" || position === "left") ? (
        <div className={`${styles.chapterGrid} ${position === "right" ? styles.chapterGridRight : styles.chapterGridLeft}`}>
          {position === "left" ? (
            <figure
              ref={imageReveal.ref}
              className={`${styles.mediaBlock} ${styles.mediaLeft} ${styles.fadeIn} ${imageReveal.visible ? styles.fadeInVisible : ""}`.trim()}
            >
              <div className={styles.mediaFrame}>
                <SmartImage src={chapitre.photo.src} alt={chapitre.photo.alt} className={styles.mediaImg} />
              </div>
              {chapitre.photo.legende ? <figcaption className={styles.mediaCaption}>{chapitre.photo.legende}</figcaption> : null}
            </figure>
          ) : null}

          <div
            ref={textReveal.ref}
            className={`${styles.reveal} ${textReveal.visible ? styles.revealVisible : ""}`.trim()}
          >
            <Paragraphs text={chapitre.texte} />
          </div>

          {position === "right" ? (
            <figure
              ref={imageReveal.ref}
              className={`${styles.mediaBlock} ${styles.mediaRight} ${styles.fadeIn} ${imageReveal.visible ? styles.fadeInVisible : ""}`.trim()}
            >
              <div className={styles.mediaFrame}>
                <SmartImage src={chapitre.photo.src} alt={chapitre.photo.alt} className={styles.mediaImg} />
              </div>
              {chapitre.photo.legende ? <figcaption className={styles.mediaCaption}>{chapitre.photo.legende}</figcaption> : null}
            </figure>
          ) : null}
        </div>
      ) : (
        <div className={styles.textOnly} ref={textReveal.ref}>
          <div className={`${styles.reveal} ${textReveal.visible ? styles.revealVisible : ""}`.trim()}>
            <Paragraphs text={chapitre.texte} />
          </div>
        </div>
      )}

      {!isLast ? (
        <svg viewBox="0 0 200 20" className={styles.separator}>
          <path
            d="M0,10 C20,2 40,18 60,10 C80,2 100,18 120,10 C140,2 160,18 180,10 C190,6 195,8 200,10"
            stroke={accent}
            strokeWidth="2"
            fill="none"
            opacity="0.1"
          />
        </svg>
      ) : null}
    </section>
  );
}
