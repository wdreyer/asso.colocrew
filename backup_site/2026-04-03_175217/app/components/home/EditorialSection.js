import Image from 'next/image';
import Link from 'next/link';

export default function EditorialSection({
  imageSrc,
  imageAlt,
  label,
  title,
  body,
  ctaText,
  ctaHref,
  reversed = false,
}) {
  const imageCol = reversed ? '45%' : '55%';
  const textCol = reversed ? '55%' : '45%';

  return (
    <section className="max-lg:flex max-lg:flex-col">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${imageCol} ${textCol}`,
        }}
        className="max-lg:!grid-cols-1"
      >
        {/* Image */}
        <div
          className="relative overflow-hidden"
          style={{
            height: '440px',
            order: reversed ? 2 : 1,
          }}
        >
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(max-width: 1024px) 100vw, 55vw"
            style={{ objectFit: 'cover' }}
          />
        </div>

        {/* Text */}
        <div
          className="flex flex-col justify-center px-16 py-16 max-lg:px-8 max-lg:py-10"
          style={{
            backgroundColor: '#faf8f3',
            order: reversed ? 1 : 2,
          }}
        >
          <p
            className="mb-4 text-xs uppercase tracking-widest"
            style={{ color: '#b5003a' }}
          >
            {label}
          </p>
          <h2
            className="text-2xl font-medium leading-snug mb-4"
            style={{ color: '#1a1a18', fontFamily: 'Poppins, sans-serif' }}
          >
            {title}
          </h2>
          <p className="text-gray-500 leading-relaxed mb-6 text-sm">
            {body}
          </p>
          <Link
            href={ctaHref}
            className="self-start text-sm pb-0.5 transition-opacity hover:opacity-70"
            style={{
              color: '#1a1a18',
              borderBottom: '1px solid currentColor',
            }}
          >
            {ctaText}
          </Link>
        </div>
      </div>
    </section>
  );
}
