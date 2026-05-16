"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";

const NAV_ITEMS = [
  { label: "Vue d'ensemble", href: "/dashboard",              icon: "grid",      exact: true },
  { label: "Réservations",   href: "/dashboard/reservations", icon: "calendar" },
  { label: "Transport",      href: "/dashboard/transport",    icon: "transport" },
  { label: "Séjours",        href: "/dashboard/sejours",      icon: "sun" },
  { label: "Pages du site",  href: "/dashboard/pages",        icon: "file" },
  { label: "Médias",         href: "/dashboard/medias",       icon: "image" },
  { label: "Témoignages",    href: "/dashboard/temoignages",  icon: "quote" },
];

function Icon({ type, size = 15 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", stroke: "currentColor" };
  switch (type) {
    case "grid":     return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
    case "sun":      return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
    case "file":     return <svg {...p}><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M9 12h6M9 16h4"/></svg>;
    case "article":  return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6"/></svg>;
    case "image":    return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5-4 4-2-2-4 4"/></svg>;
    case "quote":    return <svg {...p}><path d="M7 17h4l2-5V7H7v5h4M14 17h4l2-5V7h-6v5h4"/></svg>;
    case "transport": return <svg {...p}><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
    case "logout":   return <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    case "external": return <svg {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
    default:         return <svg {...p}><circle cx="12" cy="12" r="3"/></svg>;
  }
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const { currentUser, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const initials = useMemo(() => (currentUser?.email || "AD").slice(0, 2).toUpperCase(), [currentUser?.email]);
  const isActive = (item) => item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <div className="ds-shell">
      {/* Mobile toggle */}
      <button className="ds-hamburger" onClick={() => setOpen(v => !v)} type="button" aria-label="Menu">
        <span /><span /><span />
      </button>

      {/* Backdrop */}
      {open && <div className="ds-backdrop" onClick={() => setOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`ds-sidebar ${open ? "is-open" : ""}`}>

        {/* Brand */}
        <div className="ds-brand">
          <div className="ds-brand-mark">CC</div>
          <div className="ds-brand-text">
            <span className="ds-brand-name">ColoCrew</span>
            <span className="ds-brand-sub">Admin</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="ds-nav">
          <span className="ds-nav-label">Navigation</span>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`ds-nav-item ${isActive(item) ? "is-active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Icon type={item.icon} size={14} />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="ds-sidebar-foot">
          <a href="/" target="_blank" rel="noreferrer" className="ds-foot-link">
            <Icon type="external" size={12} />
            Voir le site
          </a>
          <div className="ds-foot-user">
            <div className="ds-foot-avatar">{initials}</div>
            <span className="ds-foot-email">{currentUser?.email}</span>
            <button type="button" className="ds-foot-logout" onClick={logout} title="Déconnexion">
              <Icon type="logout" size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ds-content">{children}</main>
    </div>
  );
}
