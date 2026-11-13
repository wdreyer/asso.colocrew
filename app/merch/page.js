import MerchClient from "./MerchClient";

export const metadata = {
  title: "Tee-shirts ColoCrew",
  description: "Le tee-shirt ColoCrew, en rouge ou en blanc. Livré chez toi sous une semaine, et chaque tee-shirt aide l'association.",
  alternates: { canonical: "https://www.colocrew.com/merch" },
};

export default function MerchPage() {
  return <MerchClient />;
}
