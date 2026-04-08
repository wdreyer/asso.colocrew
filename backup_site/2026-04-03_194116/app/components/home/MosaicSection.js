import Image from 'next/image';

const MOSAIC_PHOTOS = [
  { src: '/selection/mosaique/mosaique-1.jpeg', alt: 'ColoCrew — session surf' },
  { src: '/selection/mosaique/mosaique-2.jpeg', alt: 'ColoCrew — projet artistique' },
  { src: '/selection/mosaique/mosaique-3.jpeg', alt: 'ColoCrew — vie collective' },
  { src: '/selection/mosaique/mosaique-4.jpeg', alt: 'ColoCrew — paysage côtier' },
  { src: '/selection/mosaique/mosaique-5.jpeg', alt: 'ColoCrew — groupe ados' },
];

export default function MosaicSection() {
  const [first, ...rest] = MOSAIC_PHOTOS;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr',
        gridTemplateRows: '240px 180px',
        gap: '4px',
      }}
    >
      {/* Première photo — span 2 rows */}
      <div
        className="relative overflow-hidden group"
        style={{ gridRow: 'span 2' }}
      >
        <Image
          src={first.src}
          alt={first.alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>

      {/* 4 autres photos */}
      {rest.map((photo, i) => (
        <div key={i} className="relative overflow-hidden group">
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      ))}
    </div>
  );
}
