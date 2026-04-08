import Link from 'next/link';

export default function IntroSection() {
  return (
    <section className="py-20 px-10 max-md:px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-2 gap-16 max-md:grid-cols-1 max-md:gap-8">
        {/* Left — accroche */}
        <div>
          <p
            className="text-3xl font-medium leading-snug text-encre"
            style={{ fontFamily: 'Poppins, sans-serif', color: '#1a1a18' }}
          >
            Une colo qui prend les ados au sérieux. Pas de garderie, une vraie aventure collective.
          </p>
        </div>

        {/* Right — corps + lien */}
        <div className="flex flex-col justify-center">
          <p className="text-gray-500 leading-relaxed mb-6">
            Chez ColoCrew, chaque séjour mêle pratique sportive intensive, projet artistique collectif et pédagogie de l'émancipation. Les jeunes choisissent, organisent, créent — accompagnés par une équipe qui leur fait confiance.
          </p>
          <Link
            href="/sejours"
            className="self-start text-sm underline underline-offset-4 transition-opacity hover:opacity-70"
            style={{ color: '#b5003a' }}
          >
            Notre projet →
          </Link>
        </div>
      </div>
    </section>
  );
}
