import './globals.css';
import "easymde/dist/easymde.min.css";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import Script from 'next/script';

// Définition des métadonnées pour le SEO
export const metadata = {
  title: 'ColoCrew - Séjours de vacances',
  description:
    "ColoCrew propose des colonies de vacances sportives et artistiques pour les jeunes, favorisant l'inclusivité et l'autonomie.",
  keywords:
    "Colonie de vacances, Surf Camp, Colo inclusive, Jeunes, Sport, Arts, Éducation",
  authors: [{ name: 'ColoCrew' }],
  openGraph: {
    title: 'ColoCrew - Séjours de vacances sportifs et artistiques',
    description:
      "Découvre les colonies de vacances ColoCrew : surf, projet artistique et autonomie pour les jeunes.",
    url: 'https://www.colocrew.com',
    type: 'website',
    images: [
      {
        url: 'https://www.colocrew.com/_next/image?url=%2FLogoColoCrew.png&w=128&q=75',
        width: 128,
        height: 75,
      },
    ],
  },
  alternates: {
    canonical: 'https://www.colocrew.com',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        {/* JSON-LD pour les données structurées */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "EducationalOrganization",
              "name": "ColoCrew",
              "url": "https://www.colocrew.com",
              "logo": "https://www.colocrew.com/logo.png",
              "description": "ColoCrew propose des colonies de vacances sportives et artistiques pour les jeunes.",
              "sameAs": [
                "https://www.facebook.com/ColoCrew",
                "https://www.instagram.com/ColoCrew"
              ]
            }),
          }}
        />
        {/* Script de Google Tag Manager */}
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=AW-16992629917"
        />
        <Script
          id="gtag-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-16992629917');
            `,
          }}
        />
        {/* Autre script (ex: Simple Analytics) */}
        <Script
          src="https://scripts.simpleanalyticscdn.com/latest.js"
          strategy="afterInteractive"
        />
      </head>
      <body className="font-inter">
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="pt-18 flex-grow">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
