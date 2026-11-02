import Link from "next/link";

/** Centered card used by the sign-in, sign-up and waiting screens. */
export default function AuthFrame({ eyebrow = "Espace équipe", title, children, footer }) {
  return (
    <main className="min-h-screen bg-[#f8f2fb] px-4 pb-16 pt-28 text-[#24173D] sm:pt-36">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-3xl border border-[#ece3f3] bg-white p-6 shadow-[0_18px_50px_rgba(36,23,61,0.08)] sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#B8336A]">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">{title}</h1>
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-[#6b5c7b]">{footer}</div>}
        <p className="mt-6 text-center text-xs text-[#9a8cab]">
          Un souci pour vous connecter ? <Link href="mailto:info@colocrew.com" className="font-bold text-[#B8336A]">info@colocrew.com</Link>
        </p>
      </div>
    </main>
  );
}
