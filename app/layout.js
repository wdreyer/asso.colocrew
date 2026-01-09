import './globals.css';
import "easymde/dist/easymde.min.css";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import Script from 'next/script';
import { GoogleAnalytics } from '@next/third-parties/google'


// Définition des métadonnées pour le SEO
export const metadata = {
   icons: {
    icon: '/favicon.ico',
  },
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
        {/* Google Tag Manager */}
        <Script
          id="gtm-base"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(
              function(w,d,s,l,i){
                w[l]=w[l]||[];
                w[l].push({'gtm.start': new Date().getTime(), event:'gtm.js'});
                var f=d.getElementsByTagName(s)[0],
                    j=d.createElement(s), dl=l!='dataLayer'?'&l='+l:'';
                j.async=true;
                j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
                f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-PZ8WBFJ7');`,
          }}
        />
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
        {/* Google Ads gtag.js */}
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
        {/* TikTok Pixel */}
        <Script
          id="tiktok-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function (w, d, t) {
                w.TiktokAnalyticsObject=t;
                var ttq=w[t]=w[t]||[];
                ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
                ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
                for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
                ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
                ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script"),n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
                ttq.load('D01V103C77UDH1OVNF7G');
                ttq.page();
              }(window, document, 'ttq');
            `,
          }}
        />
      </head>
      <body className="font-inter">
        {/* Google Tag Manager (noscript) */}
        <noscript
          dangerouslySetInnerHTML={{
            __html: '<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PZ8WBFJ7" height="0" width="0" style="display:none;visibility:hidden"></iframe>'
          }}
        />
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="pt-18 flex-grow">{children}</main>
          <Footer />
        </div>
      </body>
      <GoogleAnalytics gaId="G-PWJ8EQLG1Z" />
    </html>
  );
}
