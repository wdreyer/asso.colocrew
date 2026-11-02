"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSeasons } from "@/src/lib/seasons";
import { useSessionCatalog } from "@/src/lib/sessions";

// Liste des sessions d'une saison, chacune menant à ses déroulés de journées.
export default function DashboardDayPlansIndexPage() {
  const { activeSeason, archivedSeasons, seasons } = useSeasons();
  const catalog = useSessionCatalog();
  const [season, setSeason] = useState("");
  const selectedSeason = season || activeSeason;

  const seasonOptions = useMemo(() => {
    const keys = new Set([activeSeason, ...seasons.map((item) => item.id), ...catalog.sessions.map((item) => item.season)]);
    return [...keys].filter(Boolean).sort();
  }, [activeSeason, seasons, catalog.sessions]);

  const sessions = catalog.sessions.filter((session) => session.season === selectedSeason);

  return (
    <div className="dash-page">
      <header className="dash-page-header-row">
        <div className="dash-page-header">
          <h1>Déroulés des journées</h1>
          <p>Choisissez une session pour organiser ses journées, ses repas et les congés de l’équipe.</p>
        </div>
        <div className="dash-row-actions">
          <select className="hr-season-select" value={selectedSeason} onChange={(event) => setSeason(event.target.value)} aria-label="Saison">
            {seasonOptions.map((key) => (
              <option key={key} value={key}>Saison {key}{archivedSeasons.has(key) ? " (archivée)" : ""}</option>
            ))}
          </select>
          <Link className="dash-btn" href="/dashboard/rh">Ressources humaines</Link>
        </div>
      </header>
      {catalog.loading ? (
        <p className="dash-muted">Chargement des sessions…</p>
      ) : !sessions.length ? (
        <div className="hr-empty"><p>Aucune session pour la saison {selectedSeason}. Les sessions se créent dans les dates des séjours.</p></div>
      ) : (
        <div className="hr-session-links">
          {sessions.map((session) => (
            <Link key={session.id} href={`/dashboard/rh/deroules/${encodeURIComponent(session.id)}`} className="hr-session-link">
              <span className="hr-sejour-week">{session.week}</span>
              <strong>{session.sejourName}</strong>
              <small>{session.label}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
