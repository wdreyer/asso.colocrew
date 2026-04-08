import Link from 'next/link';

export default function FooterCTA() {
  return (
    <section
      className="py-16 px-10 flex justify-between items-center gap-8 max-md:flex-col max-md:text-center max-md:px-6"
      style={{ backgroundColor: '#1a1a18' }}
    >
      {/* Left */}
      <div>
        <h2
          className="text-2xl font-medium text-white mb-2"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          Prêt·e à inscrire votre ado ?
        </h2>
        <p className="text-sm text-gray-400">
          Estimation en 2 min — réponse sous 48h.
        </p>
      </div>

      {/* Right — CTA */}
      <Link
        href="/sejours"
        className="shrink-0 inline-block px-8 py-4 text-white text-sm font-medium rounded-lg transition-opacity hover:opacity-90"
        style={{ backgroundColor: '#b5003a' }}
      >
        Voir les séjours 2026
      </Link>
    </section>
  );
}
