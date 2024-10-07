// app/layout.js
import './globals.css';
import Script from 'next/script'
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
        {/* Le contenu des balises <head> sera géré ici automatiquement par Next.js */}
      </head>
      <body>
      <Header />
     {children}
      <Footer />
      </body>
      <Script src="https://scripts.simpleanalyticscdn.com/latest.js"  />

    </html>
  );
}


// app/layout.js
