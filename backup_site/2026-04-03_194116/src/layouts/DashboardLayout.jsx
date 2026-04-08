"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";

const NAV_ITEMS = [
  { label: "TABLEAU DE BORD", href: "/dashboard", icon: "grid" },
  { label: "RÉSERVATIONS", href: "/dashboard/reservations", icon: "calendar", badge: 0 },
  { label: "SÉJOURS", href: "/dashboard/sejours", icon: "sun" },
  { label: "PAGES DU SITE", href: "/dashboard/pages", icon: "file" },
  { label: "BLOG & SOUVENIRS", href: "/dashboard/blog", icon: "article" },
  { label: "MÉDIAS", href: "/dashboard/medias", icon: "image" },
  { label: "TÉMOIGNAGES", href: "/dashboard/temoignages", icon: "quote" },
];

function Icon({ type }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (type) {
    case "grid":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
    case "sun":
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case "file":
      return <svg {...common}><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /></svg>;
    case "article":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h6M7 16h10" /></svg>;
    case "image":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m21 16-5-5L5 22" /></svg>;
    default:
      return <svg {...common}><path d="M6 17h12M8 7h8M9 12h6" /><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /></svg>;
  }
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const { currentUser, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = useMemo(() => {
    const email = currentUser?.email || "A";
    return email.slice(0, 2).toUpperCase();
  }, [currentUser?.email]);

  return (
    <div className="dash-shell">
      <button className="dash-mobile-menu" onClick={() => setSidebarOpen((v) => !v)} type="button">
        ☰
      </button>

      <aside className={`dash-sidebar ${sidebarOpen ? "dash-sidebar-open" : ""}`}>
        <div className="dash-sidebar-logo">ColoCrew</div>
        <nav className="dash-nav">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`dash-nav-item ${active ? "is-active" : ""}`} onClick={() => setSidebarOpen(false)}>
                <span className="dash-nav-icon">
                  <Icon type={item.icon} />
                </span>
                <span>{item.label}</span>
                {typeof item.badge === "number" ? <span className="dash-nav-badge">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="dash-sidebar-footer">
          <div className="dash-admin-meta">
            <span className="dash-avatar">{initials}</span>
            <div>
              <p>{currentUser?.email || "admin@colocrew.com"}</p>
            </div>
          </div>
          <button type="button" className="dash-logout-link" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </aside>

      <section className="dash-content">{children}</section>
    </div>
  );
}
