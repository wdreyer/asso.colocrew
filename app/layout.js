// app/layout.js
import './globals.css';
import Script from 'next/script'


export const metadata = {
  title: 'Colocrew',
  description: 'Des colos réinventés',
  icons: {
    icon: '/favicon.ico',  // Assurez-vous que votre favicon.ico est bien dans le dossier public
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* Le contenu des balises <head> sera géré ici automatiquement par Next.js */}
      </head>
      <body>{children}</body>
      <Script src="https://scripts.simpleanalyticscdn.com/latest.js"  />

    </html>
  );
}


// app/layout.js
