"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";
import { HR_NAV_ITEMS, canOpenDashboardItem } from "@/src/lib/dashboardAccess";

/**
 * Onglets de l'espace RH : chaque onglet est une page (adresse partageable), filtrée selon les
 * droits du compte. `counts` associe une adresse à un compteur ; `alerts` les adresses dont le
 * compteur signale une action à faire.
 */
export default function RhNav({ counts = {}, alerts = [] }) {
  const pathname = usePathname();
  const { isAdmin, sections } = useAuth();
  const items = HR_NAV_ITEMS.filter((item) => canOpenDashboardItem(item, isAdmin, sections));
  if (items.length < 2) return null;

  const isActive = (item) => (item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <nav className="hr-main-nav" aria-label="Ressources humaines">
      {items.map((item) => {
        const count = counts[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`hr-main-tab${isActive(item) ? " is-active" : ""}`}
            aria-current={isActive(item) ? "page" : undefined}
          >
            {item.label}
            {count ? <span className={`hr-tab-count${alerts.includes(item.href) ? " is-alert" : ""}`}>{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
