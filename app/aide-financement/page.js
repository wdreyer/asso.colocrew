import StaticPageFirebase from "../components/layout/StaticPageFirebase";

export default function AideFinancementPage() {
  return (
    <StaticPageFirebase
      path="/aide-financement"
      fallbackTitle="Aides & financement"
      fallbackSubtitle=""
      fallbackHeroImage=""
      eyebrow="Financement"
      contentMaxClass="max-w-7xl"
      articleMaxWidth="1040px"
    />
  );
}

