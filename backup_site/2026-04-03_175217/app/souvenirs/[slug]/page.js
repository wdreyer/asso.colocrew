import { notFound } from "next/navigation";
import SouvenirArticle from "@/src/pages/Souvenirs/SouvenirArticle";
import { SOUVENIRS, getSouvenirBySlug } from "@/src/data/souvenirs";

export function generateStaticParams() {
  return SOUVENIRS.map((item) => ({ slug: item.slug }));
}

export function generateMetadata({ params }) {
  const souvenir = getSouvenirBySlug(params.slug);
  if (!souvenir) {
    return { title: "Souvenir introuvable | ColoCrew" };
  }

  return {
    title: `${souvenir.titre} ? ${souvenir.saison} | Souvenirs ColoCrew`,
    description: souvenir.intro,
  };
}

export default function SouvenirSlugPage({ params }) {
  const souvenir = getSouvenirBySlug(params.slug);
  if (!souvenir) notFound();

  return <SouvenirArticle souvenir={souvenir} />;
}
