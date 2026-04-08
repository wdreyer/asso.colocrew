export default function PullQuote({ quote, author, role, sejour }) {
  const initials = author
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <section
      className="py-16 px-10 max-md:px-6"
      style={{
        borderTop: '1px solid #e5e7eb',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      <div className="max-w-5xl mx-auto grid gap-10 items-center max-md:gap-6"
        style={{ gridTemplateColumns: 'auto 1fr' }}
      >
        {/* Guillemet décoratif */}
        <span
          aria-hidden="true"
          className="leading-none select-none"
          style={{
            fontSize: '100px',
            lineHeight: 1,
            color: '#e5e7eb',
            fontFamily: 'Georgia, serif',
          }}
        >
          "
        </span>

        {/* Contenu */}
        <div>
          <p
            className="text-xl italic font-light leading-relaxed mb-6"
            style={{ color: '#1a1a18' }}
          >
            {quote}
          </p>

          {/* Auteur */}
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
              style={{ backgroundColor: 'rgba(181,0,58,0.1)', color: '#b5003a' }}
            >
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: '#1a1a18' }}>{author}</p>
              <p className="text-xs text-gray-500">{role}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-amber-400 text-xs">★★★★★</span>
                {sejour && (
                  <span className="text-xs text-gray-400">— {sejour}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
