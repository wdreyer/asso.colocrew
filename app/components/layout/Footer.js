import Link from "next/link";

const legalLinks = [
  { href: "/conditions-generales-de-ventes", label: "Conditions générales de vente" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/rgpd", label: "Politique de confidentialité (RGPD)" },
];

const contentLinks = [
  { href: "/sejours", label: "Tous les séjours" },
  { href: "/blog", label: "Blog" },
  { href: "/aide-financement", label: "Aides & financement" },
  { href: "/qui-sommes-nous", label: "L'association" },
];

export default function Footer() {
  return (
    <footer className="bg-gray-900 py-8 text-gray-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <h3 className="mb-2 text-xl font-semibold text-white">ColoCrew</h3>
            <p className="text-gray-400">1 rue Magenta, 93500 Pantin</p>
            <p className="text-gray-400">RNA : W931028397</p>
            <p className="text-gray-400">ORG : 093ORG0470</p>
            <p className="text-gray-400">SIRET : 93217143200010</p>
            <p className="mt-3 text-gray-400">&copy; 2026 ColoCrew. Tous droits réservés.</p>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">Liens utiles</h3>
            <nav className="flex flex-col space-y-2">
              {legalLinks.map((link) => (
                <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">Pages & Articles</h3>
            <nav className="flex flex-col space-y-2">
              {contentLinks.map((link) => (
                <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">Contact</h3>
            <p>
              <a href="mailto:info@colocrew.com" className="text-gray-400 transition-colors hover:text-white">
                info@colocrew.com
              </a>
            </p>
            <p>
              <a href="tel:0184210230" className="text-gray-400 transition-colors hover:text-white">
                01 84 21 02 30
              </a>
            </p>
            <p className="mt-4 text-sm text-gray-400">
              Pour toute demande, n'hésitez pas à nous contacter.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
