"use client";

import Link from "next/link";
import styles from "./SouvenirArticle.module.css";
import HeroSouvenir from "@/src/components/souvenirs/HeroSouvenir";
import Chapitre from "@/src/components/souvenirs/Chapitre";
import Temoignage from "@/src/components/souvenirs/Temoignage";
import GalerieSouvenir from "@/src/components/souvenirs/GalerieSouvenir";

function buildChapeau(souvenir) {
  return `À ${souvenir.lieu}, la ${souvenir.saison.toLowerCase()} a confirmé ce qui fait l’ADN ColoCrew : des journées intenses mais lisibles, un cadre éducatif concret et une place réelle laissée à chaque jeune. Ce récit suit le séjour du premier jour jusqu’au retour, en montrant les détails qui comptent : progression, entraide, autonomie, et confiance gagnée au fil des expériences. Derrière les images fortes, on retrouve surtout une méthode : faire vivre des vacances utiles, joyeuses et profondément collectives.`;
}

function getFeaturedIndexes(temoignages) {
  return temoignages
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.note === 10)
    .sort((a, b) => String(b.texte || "").length - String(a.texte || "").length)
    .slice(0, 3)
    .map((item) => item.index);
}

export default function SouvenirArticle({ souvenir }) {
  if (!souvenir) {
    return (
      <main className={styles.indexPage}>
        <div className={styles.indexInner}>
          <h1 className={styles.indexTitle}>Souvenirs</h1>
          <p className={styles.indexSub}>Sélectionne un séjour pour afficher l’article complet.</p>
          <Link href="/souvenirs" className={styles.footerCta}>
            Retour à la liste
          </Link>
        </div>
      </main>
    );
  }

  const featuredIndexes = getFeaturedIndexes(souvenir.temoignages || []);

  return (
    <main
      className={styles.page}
      style={{
        "--accent": souvenir.couleur_accent,
        "--bg": souvenir.couleur_bg,
      }}
    >
      <HeroSouvenir souvenir={souvenir} />

      <p className={styles.chapeau}>{buildChapeau(souvenir)}</p>

      {souvenir.chapitres.map((chapitre, index) => (
        <Chapitre
          key={chapitre.id}
          chapitre={chapitre}
          accent={souvenir.couleur_accent}
          isLast={index === souvenir.chapitres.length - 1}
        />
      ))}

      <section className={styles.testimonialsSection}>
        <h2 className={styles.sectionTitle}>Ils nous ont écrit</h2>
        <p className={styles.sectionSub}>Ce que jeunes et parents ont partagé après le séjour</p>

        <div className={styles.masonry}>
          {(souvenir.temoignages || []).map((item, index) => (
            <Temoignage
              key={`${item.auteur}-${index}`}
              temoignage={item}
              accent={souvenir.couleur_accent}
              bg={souvenir.couleur_bg}
              highlighted={featuredIndexes.includes(index)}
              index={index}
            />
          ))}
        </div>
      </section>

      <GalerieSouvenir photos={souvenir.galerie || []} accent={souvenir.couleur_accent} bg={souvenir.couleur_bg} />

      <footer className={styles.articleFooter}>
        <div className={styles.articleFooterInner}>
          <div>
            <h3 className={styles.footerBlockTitle}>Le prochain séjour arrive</h3>
            <p className={styles.footerText}>
              Les inscriptions pour la saison suivante sont ouvertes. Les programmes et dates sont déjà en ligne.
            </p>
            <Link href="/sejours" className={styles.footerCta}>
              Voir les séjours 2026
            </Link>
          </div>

          <div>
            <h3 className={styles.footerBlockTitle}>Une question ?</h3>
            <p className={styles.footerText}>
              Écris-nous directement, ou retrouve les actualités et coulisses du séjour sur nos réseaux.
            </p>
            <p className={styles.footerText}>
              <a className={styles.footerLink} href="mailto:info@colocrew.com">
                info@colocrew.com
              </a>
              <br />
              <a className={styles.footerLink} href="https://www.instagram.com/_colocrew/" target="_blank" rel="noreferrer">
                Instagram
              </a>
              {" · "}
              <a className={styles.footerLink} href="https://www.facebook.com/profile.php?id=61571533102707" target="_blank" rel="noreferrer">
                Facebook
              </a>
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
