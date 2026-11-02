import Link from "next/link";

/** Building blocks of the team space, in the public site's palette (Tailwind 4). */

export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#B8336A] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#9c2a59] disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e6dcef] bg-white px-4 py-2.5 text-sm font-bold text-[#24173D] transition hover:border-[#B8336A] hover:text-[#B8336A] disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass =
  "w-full rounded-xl border border-[#e2d8ec] bg-white px-3.5 py-3 text-base text-[#24173D] outline-none transition placeholder:text-[#a497b3] focus:border-[#B8336A] focus:ring-2 focus:ring-[#B8336A]/15";
export const labelClass = "mb-1.5 block text-sm font-bold text-[#24173D]";

export function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="mb-5">
      {eyebrow && <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#B8336A]">{eyebrow}</p>}
      <h1 className="mt-1 text-[1.9rem] font-bold leading-tight text-[#24173D] sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 text-sm leading-relaxed text-[#6b5c7b]">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "", as: Tag = "section" }) {
  return <Tag className={`rounded-2xl border border-[#ece3f3] bg-white p-4 shadow-[0_6px_20px_rgba(36,23,61,0.05)] sm:p-5 ${className}`}>{children}</Tag>;
}

export function CardLink({ href, children, className = "" }) {
  return (
    <Link
      href={href}
      className={`block rounded-2xl border border-[#ece3f3] bg-white p-4 shadow-[0_6px_20px_rgba(36,23,61,0.05)] transition hover:-translate-y-0.5 hover:border-[#d9c3e6] sm:p-5 ${className}`}
    >
      {children}
    </Link>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 mt-7 flex items-end justify-between gap-3 first:mt-0">
      <h2 className="text-xl font-bold text-[#24173D]">{children}</h2>
      {action}
    </div>
  );
}

const TONES = {
  neutral: "bg-[#f3eff7] text-[#5b4d6b] border-[#e4dcec]",
  success: "bg-[#ecfdf3] text-[#15803d] border-[#bbf7d0]",
  warning: "bg-[#fff8e6] text-[#9a6200] border-[#f6dfa4]",
  danger: "bg-[#fff1f0] text-[#b42318] border-[#fecdca]",
  info: "bg-[#f3efff] text-[#6d28d9] border-[#ddd0fb]",
  pink: "bg-[#fff0f6] text-[#B8336A] border-[#f3c6da]",
};

export function Badge({ tone = "neutral", children, className = "" }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${TONES[tone] || TONES.neutral} ${className}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#dccfe7] bg-white/70 px-5 py-8 text-center">
      <p className="font-bold text-[#24173D]">{title}</p>
      {children && <div className="mt-1.5 text-sm leading-relaxed text-[#6b5c7b]">{children}</div>}
    </div>
  );
}

export function Loader({ label = "Chargement…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-[#6b5c7b]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#ecdcea] border-t-[#B8336A]" aria-hidden="true" />
      {label}
    </div>
  );
}

export function InfoGrid({ items }) {
  const rows = (items || []).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[#9a8cab]">{label}</dt>
          <dd className="mt-0.5 break-words text-sm font-bold text-[#24173D]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = "info", children }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${TONES[tone] || TONES.info}`}>{children}</div>;
}
