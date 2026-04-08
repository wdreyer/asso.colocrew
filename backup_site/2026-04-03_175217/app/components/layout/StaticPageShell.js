import Image from "next/image";

function Wave({ fill = "#f8f2fb" }) {
  return (
    <div className="pointer-events-none -mb-px h-14 md:h-20">
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="h-full w-full">
        <path
          fill={fill}
          d="M0,86L72,80C144,74,288,62,432,52C576,42,720,34,864,40C1008,46,1152,66,1296,74C1368,78,1404,80,1440,82L1440,120L0,120Z"
        />
        <path
          fill={fill}
          fillOpacity="0.72"
          d="M0,98L80,90C160,82,320,66,480,60C640,54,800,58,960,66C1120,74,1280,86,1360,92L1440,98L1440,120L0,120Z"
        />
      </svg>
    </div>
  );
}

export default function StaticPageShell({ title, subtitle, heroImage, children }) {
  return (
    <main className="relative overflow-hidden bg-[#f8f2fb] text-[#24173D]">
      <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-[#f2dde8]/60 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-44 h-80 w-80 rounded-full bg-[#e6dcf6]/55 blur-3xl" />

      <section className="relative isolate overflow-hidden">
        <div className="relative h-[190px] md:h-[240px]">
          {heroImage ? (
            <Image src={heroImage} alt={title} fill className="object-cover" sizes="100vw" priority />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#f3e8f2_0%,#efe7fb_50%,#f8eef5_100%)]" />
          )}

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(36,23,61,0.12)_0%,rgba(36,23,61,0.34)_100%)]" />
          <div className="absolute inset-0 flex items-end justify-center px-5 pb-8 text-center md:pb-10">
            <div>
              <h1
                className="text-3xl font-extrabold tracking-tight text-white md:text-5xl"
                style={{ fontFamily: '"Baloo 2", cursive' }}
              >
                {title}
              </h1>
              {subtitle ? (
                <p className="mx-auto mt-2 max-w-3xl text-sm font-semibold text-white/95 md:text-base">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>

        <Wave fill="#f8f2fb" />
      </section>

      <section className="relative pb-16 pt-1">
        <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <div className="static-content text-[#3c3156]">{children}</div>
        </div>
      </section>
    </main>
  );
}
