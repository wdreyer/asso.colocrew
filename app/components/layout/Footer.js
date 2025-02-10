import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Grille à 3 colonnes sur desktop, 1 sur mobile */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Colonne 1 : Informations générales */}
          <div>
            <h3 className="text-white text-xl font-semibold mb-2">ColoCrew</h3>
            <p className="text-gray-400">1 rue Magenta, 93500 Pantin</p>
            <p className="text-gray-400">RNA: W931028397 </p>
            <p className="text-gray-400">ORG: 093ORG0470</p>
            <p className="text-gray-400"> SIRET: 93217143200010</p>
            <p className="text-gray-400 mt-2">&copy; 2024 ColoCrew. Tous droits réservés.</p>
          </div>

          {/* Colonne 2 : Liens légaux */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-2">Liens utiles</h3>
            <nav className="flex flex-col space-y-2">
              <Link
                href="/conditions-generales-de-ventes"
                className="hover:text-white transition-colors"
              >
                Conditions générales de ventes
              </Link>
              <Link
                href="/mentions-legales"
                className="hover:text-white transition-colors"
              >
                Mentions légales
              </Link>
              <Link
                href="/rgpd"
                className="hover:text-white transition-colors"
              >
                Politique de Confidentialité (RGPD)
              </Link>
            </nav>
          </div>

          {/* Colonne 3 : Contact */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-2">Contact</h3>
            <p>
              <a
                href="mailto:info@colocrew.com"
                className="text-gray-400 hover:text-white transition-colors"
              >
                info@colocrew.com
              </a>
            </p>
            <p>
              <a
                href="tel:0184210230"
                className="text-gray-400 hover:text-white transition-colors"
              >
                01 84 21 02 30
              </a>
            </p>
            <div className="mt-4">
              <p className="text-sm text-gray-400">
                Pour toute demande, n’hésitez pas à nous contacter.
              </p>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}
