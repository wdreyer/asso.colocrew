import Image from "next/image";

export default function StaticPageShell({
  title,
  subtitle,
  heroImage,
  eyebrow,
  children,
  contentMaxClass = "max-w-6xl",
  articleMaxWidth = "",
}) {
  return (
    <main className="relative bg-[#f8f2fb] text-[#24173D]">

      {/* ── HERO ── */}
      <section className="relative min-h-[300px] md:min-h-[380px] overflow-hidden">

        {/* Fond */}
        {heroImage ? (
          <Image src={heroImage} alt={title} fill className="object-cover" sizes="100vw" priority />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(140deg, #1e1040 0%, #4a1870 45%, #B8336A 80%, #d96a9a 100%)",
              }}
            />
            <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full opacity-15"
              style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
            <div className="absolute bottom-10 left-1/3 w-52 h-52 rounded-full opacity-10"
              style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
            <div className="absolute top-8 left-10 w-20 h-20 rounded-full opacity-10 border border-white/25" />
            <div className="absolute bottom-14 right-12 w-12 h-12 rounded-full opacity-15 border border-white/20" />
          </>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/65" />

        {/* Titre aligné comme le contenu */}
        <div className="absolute bottom-0 left-0 right-0 pb-20 md:pb-24">
          <div className={`mx-auto w-full ${contentMaxClass} px-4 md:px-8`}
               style={articleMaxWidth ? { "--article-max-width": articleMaxWidth } : undefined}>
            <div style={{ maxWidth: "var(--article-max-width, 860px)", margin: "0 auto" }}>
              {eyebrow && (
                <span
                  className="inline-block mb-3 px-3.5 py-1 rounded-full text-[0.62rem] font-bold tracking-[0.2em] uppercase text-white/90 border border-white/30"
                  style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(6px)" }}
                >
                  {eyebrow}
                </span>
              )}
              <h1
                className="font-extrabold text-white leading-[1.1] drop-shadow"
                style={{
                  fontFamily: '"Baloo 2", cursive',
                  fontSize: "clamp(2rem, 5.5vw, 3.5rem)",
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="mt-3 text-sm md:text-base text-white/80 font-medium leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── CARTE FLOTTANTE ── */}
      <div
        className="relative z-10 -mt-10 md:-mt-14 rounded-t-[2rem] md:rounded-t-[2.5rem] bg-[#f8f2fb]"
        style={{ boxShadow: "0 -12px 48px rgba(36,23,61,0.16)" }}
      >
        <div className="flex justify-center pt-1.5">
          <div className="w-10 h-1 rounded-full bg-[#B8336A]/25" />
        </div>

        {/* Blobs */}
        <div className="pointer-events-none absolute -left-20 top-16 h-72 w-72 rounded-full bg-[#f2dde8]/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-40 h-80 w-80 rounded-full bg-[#e6dcf6]/55 blur-3xl" />

        <section className="relative pb-20 pt-0">
          <div className={`mx-auto w-full ${contentMaxClass} px-4 md:px-8`}>
            <div
              className="static-content text-[#3c3156]"
              style={articleMaxWidth ? { "--article-max-width": articleMaxWidth } : undefined}
            >
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
