import Link from 'next/link';

const TESTIMONIALS = [
  {
    initials: 'AM',
    name: 'Anaëlle M.',
    info: 'Maman de Tom, 14 ans',
    quote:
      'Mon fils est parti timide et revenu avec une confiance incroyable. L\'équipe ColoCrew a su le voir grandir. On repart l\'été prochain !',
    sejour: 'My Creative Surf Camp 2024',
    stars: 5,
  },
  {
    initials: 'JP',
    name: 'Jean-Paul R.',
    info: 'Papa de Zoé, 13 ans',
    quote:
      'Une organisation au top, une communication fluide avec les parents, et une vraie pédagogie. Zoé a fait ses premières vagues et n\'a plus peur de rien.',
    sejour: 'My Creative Surf Camp 2024',
    stars: 5,
  },
  {
    initials: 'SL',
    name: 'Sophie L.',
    info: 'Maman de Léa, 15 ans',
    quote:
      'Léa nous a appelés le 3e jour pour dire qu\'elle ne voulait pas rentrer. C\'est le plus beau retour qu\'on pouvait espérer.',
    sejour: 'Surf & Côte Ouest 2024',
    stars: 5,
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-20 px-10 max-md:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h2
            className="text-2xl font-medium"
            style={{ color: '#1a1a18', fontFamily: 'Poppins, sans-serif' }}
          >
            Ce que disent les familles
          </h2>
          <Link
            href="/sejours"
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: '#b5003a' }}
          >
            Tous les avis →
          </Link>
        </div>

        {/* List */}
        <div className="divide-y divide-gray-100">
          {TESTIMONIALS.map((t) => {
            const initials = t.initials || t.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={t.name} className="flex gap-5 py-6">
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(181,0,58,0.1)', color: '#b5003a' }}
                >
                  {initials}
                </div>

                {/* Content */}
                <div className="min-w-0">
                  <p className="italic text-sm text-gray-500 leading-relaxed mb-2">
                    "{t.quote}"
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: '#1a1a18' }}>{t.name}</span>
                    <span className="text-xs text-gray-400">— {t.info}</span>
                    <span className="text-amber-400 text-xs">{'★'.repeat(t.stars)}</span>
                    {t.sejour && (
                      <span
                        className="text-xs px-2 py-0.5 rounded text-gray-500 bg-gray-100"
                      >
                        {t.sejour}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
