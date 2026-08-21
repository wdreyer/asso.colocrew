import MerchClient from "./MerchClient";

export const metadata = {
  title: "Merch ColoCrew - Summer Tour 2k26",
  description:
    "Précommande le tee-shirt ColoCrew Summer Tour 2k26, en rouge ou en blanc, et représente la crew tout en soutenant la colo.",
  alternates: {
    canonical: "https://www.colocrew.com/merch",
  },
};

export default function MerchPage() {
  return <MerchClient />;
}
