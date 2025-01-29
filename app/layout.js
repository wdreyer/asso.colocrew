// app/layout.js
import './globals.css';
import Script from 'next/script';
import Header from './components/Header';
import Footer from './components/Footer';

export const metadata = {
  title: 'Colocrew',
  description: 'Des colos réinventés',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* Script GA principal */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-PWJ8EQLG1Z"
          strategy="afterInteractive"
        />
        
        {/* Script de configuration GA */}
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-PWJ8EQLG1Z');
          `}
        </Script>
      </head>
      <body>
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-grow">{children}</main>
          <Footer />
        </div>
        
        {/* Script SimpleAnalytics */}
        <Script
          src="https://scripts.simpleanalyticscdn.com/latest.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
