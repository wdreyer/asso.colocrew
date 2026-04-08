import StaticPageFirebase from "../components/layout/StaticPageFirebase";

export default function QuiSommesNousPage() {
  return (
    <StaticPageFirebase
      path="/qui-sommes-nous"
      fallbackTitle="Qui sommes-nous ?"
      fallbackSubtitle=""
      fallbackHeroImage=""
      eyebrow="À propos"
      contentMaxClass="max-w-7xl"
      articleMaxWidth="1040px"
    />
  );
}

