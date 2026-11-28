"use client";

import Link from "next/link";
import Overview from "@/src/components/dashboard/Overview";
import { useAuth } from "@/src/contexts/AuthContext";
import { DASHBOARD_SECTIONS } from "@/src/lib/dashboardAccess";

export default function DashboardHomePage() {
  const { isAdmin, sections } = useAuth();
  if (isAdmin || sections.includes("overview")) return <Overview />;

  return (
    <div className="dash-page">
      <header className="dash-page-header"><h1>Mes sections</h1></header>
      <div className="dash-section">
        <div className="dash-row-actions" style={{ flexWrap: "wrap" }}>
          {DASHBOARD_SECTIONS.filter((item) => sections.includes(item.section)).map((item) => (
            <Link key={item.section} className="dash-btn" href={item.href}>{item.label}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
