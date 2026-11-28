export const DASHBOARD_NAV = [
  { label: "Vue d’ensemble", href: "/dashboard", icon: "grid", exact: true, section: "overview" },
  {
    group: "Ventes & production",
    items: [
      { label: "Séjours en vente", href: "/dashboard/sejours", icon: "sun", section: "stays" },
      { label: "Production séjour", href: "/dashboard/production", icon: "production", section: "production" },
      { label: "Hébergements", href: "/dashboard/hebergements", icon: "home", section: "accommodation" },
      { label: "Réservations", href: "/dashboard/reservations", icon: "calendar", section: "reservations" },
      { label: "Finances", href: "/dashboard/finances", icon: "finance", section: "finance" },
      { label: "Abonnements", href: "/dashboard/abonnements", icon: "subscription", section: "subscriptions" },
      { label: "Tee-shirts", href: "/dashboard/tee-shirts", icon: "shirt", section: "merch" },
    ],
  },
  {
    group: "Opérations",
    items: [
      {
        label: "Ressources humaines", href: "/dashboard/rh", icon: "users", section: "hr",
        children: [{ label: "Comptes équipe", href: "/dashboard/rh/comptes", adminOnly: true }],
      },
      { label: "Déroulés", href: "/dashboard/rh/deroules", icon: "calendar", section: "dayPlans" },
      { label: "Convoyages", href: "/dashboard/transport", icon: "transport", section: "transport" },
      { label: "Bénévoles", href: "/dashboard/benevoles", icon: "heart", section: "volunteers" },
    ],
  },
  {
    group: "Communication",
    items: [
      { label: "Emails familles", href: "/dashboard/communication", icon: "send", section: "communication" },
      { label: "Campagnes", href: "/dashboard/campagnes", icon: "mail", section: "campaigns" },
    ],
  },
  {
    group: "Site web",
    items: [
      { label: "Pages du site", href: "/dashboard/pages", icon: "file", section: "pages" },
      { label: "Blog", href: "/dashboard/blog", icon: "file", section: "blog" },
      { label: "Médias", href: "/dashboard/medias", icon: "image", section: "media" },
      { label: "Témoignages", href: "/dashboard/temoignages", icon: "quote", section: "testimonials" },
    ],
  },
  {
    group: "Administration",
    items: [
      { label: "Archives des saisons", href: "/dashboard/archives", icon: "archive", section: "archives" },
      { label: "Droits d’accès", href: "/dashboard/acces", icon: "users", adminOnly: true },
    ],
  },
];

export const DASHBOARD_ITEMS = DASHBOARD_NAV.flatMap((entry) =>
  entry.items ? entry.items.flatMap((item) => [item, ...(item.children || [])]) : [entry],
);

export const DASHBOARD_SECTIONS = DASHBOARD_ITEMS.filter((item) => item.section);
const knownSections = new Set(DASHBOARD_SECTIONS.map((item) => item.section));
const routes = [...DASHBOARD_ITEMS].sort((a, b) => b.href.length - a.href.length);

export function effectiveDashboardSections(account) {
  if (account?.status !== "approved" || !account.memberId) return [];
  return Array.isArray(account.dashboardSections)
    ? [...new Set(account.dashboardSections.filter((section) => knownSections.has(section)))]
    : [];
}

export function canOpenDashboardItem(item, isAdmin, sections) {
  return Boolean(item && (isAdmin || (!item.adminOnly && sections.includes(item.section))));
}

export function canOpenDashboardPath(pathname, isAdmin, sections) {
  if (pathname === "/dashboard") return isAdmin || sections.length > 0;
  const item = routes.find((entry) =>
    pathname === entry.href || (!entry.exact && pathname.startsWith(entry.href + "/")),
  );
  return canOpenDashboardItem(item, isAdmin, sections);
}
