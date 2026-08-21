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
  return (
    <>
      <style>{`
        body:has(.merchStandalone) header,
        body:has(.merchStandalone) footer,
        body:has(.merchStandalone) .fixed.bottom-20.right-5 {
          display: none !important;
        }

        body:has(.merchStandalone) main {
          padding-top: 0 !important;
        }
      `}</style>
      <MerchClient />
    </>
  );
}
