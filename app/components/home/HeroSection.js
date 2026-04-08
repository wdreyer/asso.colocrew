import Image from 'next/image';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden h-[90vh] md:h-[90vh] sm:h-[70vh]">
      <Image
        src="/selection/hero/hero.jpeg"
        alt="ColoCrew — séjours surf et créatifs Pays Basque"
        fill
        priority
        style={{ objectFit: 'cover' }}
        sizes="100vw"
      />
      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end p-10 max-sm:flex-col max-sm:items-start max-sm:gap-6">
        {/* Left */}
        <div className="space-y-4 max-w-lg">
          <span
            className="inline-block px-3 py-1 text-xs font-semibold tracking-widest uppercase text-white rounded"
            style={{ backgroundColor: '#b5003a' }}
          >
            Été 2026 · Pays Basque
          </span>
          <h1
            className="text-white font-bold leading-none"
            style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontFamily: 'Poppins, sans-serif' }}
          >
            Réinventons<br />les colos.
          </h1>
          <p className="text-white/80 text-base leading-relaxed max-w-sm">
            Surf, création, autonomie — des séjours pensés pour grandir vraiment.
          </p>
          <Link
            href="/sejours"
            className="inline-block px-6 py-3 text-white text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#b5003a' }}
          >
            Découvrir les séjours →
          </Link>
        </div>

        {/* Right — stats */}
        <div className="flex gap-10 max-sm:gap-6">
          <div className="text-right max-sm:text-left">
            <p className="text-white text-3xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>450+</p>
            <p className="text-white/70 text-sm">jeunes accompagnés</p>
          </div>
          <div className="text-right max-sm:text-left">
            <p className="text-white text-3xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>98%</p>
            <p className="text-white/70 text-sm">de satisfaction</p>
          </div>
        </div>
      </div>
    </section>
  );
}
