import MerchClient from "./MerchClient";

export const metadata = {
  title: "Merch ColoCrew - Summer Tour 2k26",
  description:
    "Commande le tee-shirt ColoCrew Summer Tour 2k26 et represente la crew tout en soutenant la colo.",
  alternates: {
    canonical: "https://www.colocrew.com/merch",
  },
};

export default function MerchPage() {
  return <MerchClient />;
}
