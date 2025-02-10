'use client';

import './globals.css';
import "easymde/dist/easymde.min.css";
import Script from "next/script";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function RootLayout({ children }) {
  const pathname = usePathname();

  // Formatage du titre de la page à partir de l'URL
  const pageTitle = pathname
    .split("/")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const formattedTitle = pageTitle ? ` ${pageTitle} - ColoCrew.com ` : "ColoCrew.com";

  const [consent, setConsent] = useState(null);

  useEffect(() => {
    const storedConsent = localStorage.getItem("cookie_consent");
    if (storedConsent !== null) {
      setConsent(JSON.parse(storedConsent));
    }
  }, []);

  const handleConsent = (value) => {
    setConsent(value);
    localStorage.setItem("cookie_consent", JSON.stringify(value));
  };

  return (
    <html lang="fr">
      <head>
        <title>{formattedTitle}</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="font-inter">
        {/* Bannière de consentement aux cookies - design discret et professionnel */}
        {consent === null && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 max-w-md w-full bg-gray-800 bg-opacity-95 text-white p-4 rounded-lg shadow-md z-50">
            <p className="text-sm">
              Nous utilisons des cookies pour améliorer votre expérience. En poursuivant, vous acceptez leur utilisation.
            </p>
            <div className="mt-3 flex justify-end space-x-2">
              <button
                onClick={() => handleConsent(false)}
                className="px-3 py-1 border cursor-pointer border-gray-500 rounded hover:bg-gray-700 transition-colors"
              >
                Refuser
              </button>
              <button
                onClick={() => handleConsent(true)}
                className="px-3 py-1 bg-blue-600 cursor-pointer rounded hover:bg-blue-700 transition-colors"
              >
                Accepter
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="pt-18 flex-grow">
            {children}
          </main>
          <Footer />
        </div>

        {/* Chargement des scripts uniquement si l'utilisateur a consenti */}
        {consent === true && (
          <>
            {/* Google Analytics */}
            <Script
              async
              src="https://www.googletagmanager.com/gtag/js?id=G-PWJ8EQLG1Z"
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag("js", new Date());
                gtag("config", "G-PWJ8EQLG1Z", { anonymize_ip: true });
              `}
            </Script>

            {/* Simple Analytics */}
            <Script
              src="https://scripts.simpleanalyticscdn.com/latest.js"
              strategy="afterInteractive"
            />

            {/* Stripe */}
            <Script async src="https://js.stripe.com/v3/"></Script>
          </>
        )}
      </body>
    </html>
  );
}
