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
        <script type="text/javascript">
var sc_project=13080506; 
var sc_invisible=1; 
var sc_security="bb9779c0"; 
</script>
<script type="text/javascript"
src="https://www.statcounter.com/counter/counter.js" async></script>
<noscript><div class="statcounter"><a title="Web Analytics Made Easy -
Statcounter" href="https://statcounter.com/" target="_blank">
</a></div></noscript>     


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
