import Image from 'next/image';
import Link from 'next/link';

const ARTICLES = [
  {
    src: '/selection/blog-1/blog-1.jpeg',
    alt: 'Article ColoCrew',
    category: 'Surf',
    title: 'Pourquoi le surf est le meilleur sport pour apprendre à tomber (et se relever)',
    date: 'Mars 2026',
    href: '/sejours',
  },
  {
    src: '/selection/blog-2/blog-2.jpeg',
    alt: 'Article ColoCrew',
    category: 'Pédagogie',
    title: 'Ce qu\'on entend par "pédagogie de l\'émancipation" — concrètement',
    date: 'Février 2026',
    href: '/sejours',
  },
  {
    src: '/selection/blog-3/blog-3.jpeg',
    alt: 'Article ColoCrew',
    category: 'Famille',
    title: '5 questions à se poser avant d\'inscrire son ado en séjour sportif',
    date: 'Janvier 2026',
    href: '/sejours',
  },
];

export default function BlogSection() {
  return (
    <section className="py-20 px-10 max-md:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <h2
            className="text-2xl font-medium"
            style={{ color: '#1a1a18', fontFamily: 'Poppins, sans-serif' }}
          >
            Ressources & conseils
          </h2>
          <Link
            href="/sejours"
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: '#b5003a' }}
          >
            Tous les articles →
          </Link>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-8 max-md:grid-cols-1">
          {ARTICLES.map((article) => (
            <Link key={article.title} href={article.href} className="group block">
              {/* Photo */}
              <div className="relative h-48 overflow-hidden rounded-lg mb-4">
                <Image
                  src={article.src}
                  alt={article.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </div>

              {/* Meta */}
              <p
                className="text-xs uppercase tracking-widest mb-2"
                style={{ color: '#b5003a' }}
              >
                {article.category}
              </p>
              <p
                className="text-sm font-medium leading-snug"
                style={{ color: '#1a1a18' }}
              >
                {article.title}
              </p>
              <p className="text-xs text-gray-400 mt-1">{article.date}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
