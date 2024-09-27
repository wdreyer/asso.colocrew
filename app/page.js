import Header from './components/Header';
import QuiSommesNous from './components/QuiSommesNous';
import NosSejours from './components/NosSejours';
import Adherer from './components/Adherer';
import Footer from './components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen font-sans">
      {/* Header */}
      <Header />

        <QuiSommesNous />
        <NosSejours />
        <Adherer />


      {/* Footer */}
      <Footer />
    </div>
  );
}
