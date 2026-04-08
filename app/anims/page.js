import StaticPageFirebase from "../components/layout/StaticPageFirebase";

export default function AnimsPage() {
  return (
    <StaticPageFirebase
      path="/anims"
      fallbackTitle="Équipe et recrutement"
      fallbackSubtitle=""
      fallbackHeroImage="/anims.jpg"
      eyebrow="L'équipe"
      contentMaxClass="max-w-7xl"
      articleMaxWidth="1040px"
    />
  );
}


