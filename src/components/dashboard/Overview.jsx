"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { isArchivedRecord, seasonOfDate, seasonOfRecord, useSeasons } from "@/src/lib/seasons";
import { formatDateRange, sessionIdFor, useSessionCatalog } from "@/src/lib/sessions";
import {
  computeSessionOccupancy,
  normalizeReservationStatus,
  reservationChildCount,
  sessionFillState,
} from "@/src/lib/reservations";

/* ─── Metric icon SVGs ───────────────────────────────────────────────── */
function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 16-5-5-4 4-2-2-4 4" />
    </svg>
  );
}
function IconQuote() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d="M7 17h4l2-5V7H7v5h4M14 17h4l2-5V7h-6v5h4" />
    </svg>
  );
}
function IconFinance() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /><path d="m3 6 6-3 6 5 6-4" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconTransport() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 4v4h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}
function IconProduction() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16V9" /><path d="M13 16V7" /><path d="M18 16v-4" /><path d="M7 4h11l2 3-2 3H7z" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* ─── Contrats d'une session ─────────────────────────────────────────── */
/**
 * A contract points at its session with `sessionId`; older ones only have a stay code and a
 * week, matched against the catalog of the same season.
 */
function contractSessionId(contract, sessions) {
  if (contract.sessionId) return contract.sessionId;
  if (contract.sejourId && contract.startDate) return sessionIdFor(contract.sejourId, contract.startDate);
  const code = String(contract.stayCode || "").toUpperCase();
  const name = String(contract.stayName || "").toLowerCase();
  const match = sessions.find((session) =>
    session.week === contract.week
    && (session.sejourCode === code || session.sejourName.toLowerCase() === name),
  );
  return match?.id || "";
}

/* ─── Quick actions config ───────────────────────────────────────────── */
const QUICK_ACTIONS = [
  { label: "Séjours en vente", sub: "Créer les fiches publiques", href: "/dashboard/sejours", icon: <IconSun /> },
  { label: "Production séjour", sub: "Simuler rentabilité et coûts", href: "/dashboard/production", icon: <IconProduction /> },
  { label: "Réservations", sub: "Gérer et valider", href: "/dashboard/reservations", icon: <IconCalendar /> },
  { label: "Suivi financier", sub: "CA, paiements et restes", href: "/dashboard/finances", icon: <IconFinance /> },
  { label: "Ressources humaines", sub: "Contrats, équipes, paies", href: "/dashboard/rh", icon: <IconUsers /> },
  { label: "Convoyages", sub: "Trajets, billets, convocations", href: "/dashboard/transport", icon: <IconTransport /> },
  { label: "Ajouter des médias", sub: "Photos et galeries", href: "/dashboard/medias", icon: <IconImage /> },
  { label: "Témoignages", sub: "Retours qualitatifs", href: "/dashboard/temoignages", icon: <IconQuote /> },
  { label: "Pages du site", sub: "Contenu éditorial", href: "/dashboard/pages", icon: null },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */
function tsToMs(value) {
  if (value?.toMillis) return value.toMillis();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}


function timeAgo(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 2) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (h < 24) return `il y a ${h}h`;
  if (d < 7) return `il y a ${d}j`;
  return new Date(ms).toLocaleDateString("fr-FR");
}

/* ─── Occupation table (semaine × séjour) ───────────────────────────── */
function rateTone(rate) {
  if (rate === null) return "neutral";
  if (rate >= 80) return "green";
  if (rate >= 50) return "orange";
  return "red";
}

function OccupancyTable({ columns, season }) {
  if (columns.length === 0) return null;

  return (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>Occupation des sessions {season}</h2>
        <span style={{ fontSize: 11, color: "var(--dash-muted)" }}>Inscriptions validées · taux de remplissage · équipe</span>
      </div>
      <div className="hr-table-scroll">
        <table className="dash-occupancy-table">
          <tbody>
            <tr className="dash-occ-head-row">
              <td className="dash-occ-row-label">Session</td>
              {columns.map((col) => <td key={`${col.id}-w`} title={col.dates}>{col.week}</td>)}
            </tr>
            <tr className="dash-occ-head-row">
              <td className="dash-occ-row-label">Séjour</td>
              {columns.map((col) => <td key={`${col.id}-n`} title={col.dates}>{col.stay}</td>)}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Inscriptions validées</td>
              {columns.map((col) => (
                <td key={`${col.id}-v`}><strong>{col.validated}</strong>{col.capacity ? ` / ${col.capacity}` : ""}</td>
              ))}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Demandes · liste d'attente</td>
              {columns.map((col) => (
                <td key={`${col.id}-p`}>{col.pending || "—"} · {col.waitlist || "—"}</td>
              ))}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Taux remplissage</td>
              {columns.map((col) => (
                <td key={`${col.id}-r`}>
                  {col.rate === null ? "—" : (
                    <span className={`dash-occ-badge dash-occ-badge-${rateTone(col.rate)}`}>
                      {col.rate}%
                    </span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Animateurs</td>
              {columns.map((col) => (
                <td key={`${col.id}-a`}>{col.animCount || "—"}</td>
              ))}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Équipe totale</td>
              {columns.map((col) => (
                <td key={`${col.id}-s`}>{col.staffCount || "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── Registration evolution chart (inline SVG, no extra dependency) ── */
function RegistrationChart({ series }) {
  if (series.length === 0) return null;
  const max = Math.max(...series.map((d) => d.count), 1);
  const width = 600;
  const height = 140;
  const barGap = 2;
  const barWidth = width / series.length - barGap;

  return (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>Évolution des inscriptions</h2>
        <span style={{ fontSize: 11, color: "var(--dash-muted)" }}>30 derniers jours</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: 140 }}>
        {series.map((d, i) => {
          const barHeight = (d.count / max) * (height - 24);
          const x = i * (barWidth + barGap);
          const y = height - 20 - barHeight;
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, d.count > 0 ? 2 : 0)} rx={1.5} fill="#B8336A" opacity={0.85}>
                <title>{`${d.label} : ${d.count} inscription${d.count > 1 ? "s" : ""}`}</title>
              </rect>
              {(i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2)) && (
                <text x={x + barWidth / 2} y={height - 6} fontSize="9" fill="var(--dash-muted)" textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

/* ─── Component ──────────────────────────────────────────────────────── */
export default function Overview() {
  const router = useRouter();

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const [metrics, setMetrics] = useState({
    totalSejours: null,
    totalPhotos: null,
    totalTemoignages: null,
  });
  const [reservations, setReservations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  // Chiffres de la saison active uniquement ; les saisons clôturées sont dans les archives.
  const { activeSeason, archivedSeasons } = useSeasons();
  const catalog = useSessionCatalog(activeSeason);

  useEffect(() => {
    async function loadData() {
      setLoadingMetrics(true);
      try {
        const [reservationsSnap, sejoursSnap, photosSnap, temoignagesSnap, contractsSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.RESERVATIONS)),
          getDocs(collection(db, COLLECTIONS.SEJOURS)),
          getDocs(collection(db, COLLECTIONS.PHOTOS)),
          getDocs(collection(db, "retours")),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
        ]);
        setReservations(reservationsSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setContracts(contractsSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setMetrics({
          totalSejours: sejoursSnap.size,
          totalPhotos: photosSnap.size,
          totalTemoignages: temoignagesSnap.size,
        });
      } catch {
        // silently fail — dashboard still usable
      } finally {
        setLoadingMetrics(false);
      }
    }
    loadData();
  }, []);

  /* Réservations de la saison active, archivées exclues. */
  const seasonReservations = useMemo(
    () => reservations.filter((data) => !isArchivedRecord(data, archivedSeasons) && seasonOfRecord(data) === activeSeason),
    [reservations, archivedSeasons, activeSeason],
  );

  const pendingReservations = useMemo(
    () => seasonReservations
      .filter((data) => normalizeReservationStatus(data.status) === "pending")
      .reduce((total, data) => total + reservationChildCount(data), 0),
    [seasonReservations],
  );

  const recentActivity = useMemo(() => [...seasonReservations]
    .map((data) => {
      const legal = data?.legal || {};
      return {
        id: data.id,
        nom: `${legal?.firstName || legal?.prenom || ""} ${legal?.lastName || legal?.nom || ""}`.trim() || data?.name || "Anonyme",
        sejour: data?.sejour?.name || data?.sejourName || "séjour",
        ms: tsToMs(data?.createdAt),
        status: normalizeReservationStatus(data?.status),
      };
    })
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6), [seasonReservations]);

  /* ── Occupation par session de la saison active ── */
  const occupancyColumns = useMemo(() => {
    const occupancy = computeSessionOccupancy(seasonReservations, catalog.sessions);
    const staff = new Map();
    contracts
      .filter((data) => data.archived !== true && (data.season ? String(data.season) : seasonOfDate(data.startDate)) === activeSeason)
      .forEach((data) => {
        const sessionId = contractSessionId(data, catalog.sessions);
        if (!sessionId) return;
        if (!staff.has(sessionId)) staff.set(sessionId, { staffIds: new Set(), animIds: new Set() });
        const memberKey = data.memberId || data.memberName || data.id;
        staff.get(sessionId).staffIds.add(memberKey);
        if (String(data.role || "").toLowerCase().includes("anim")) staff.get(sessionId).animIds.add(memberKey);
      });
    return catalog.sessions
      .map((session) => {
        const entry = occupancy.get(session.id) || {};
        const fill = sessionFillState(session.capacity, entry);
        const team = staff.get(session.id);
        return {
          id: session.id,
          week: session.week,
          stay: session.sejourCode || session.sejourName,
          dates: `${session.sejourName} · ${formatDateRange(session.startDate, session.endDate)}`,
          validated: entry.validated || 0,
          pending: entry.pending || 0,
          waitlist: entry.waitlist || 0,
          capacity: fill.capacity || null,
          rate: fill.rate,
          staffCount: team?.staffIds.size || 0,
          animCount: team?.animIds.size || 0,
        };
      });
  }, [seasonReservations, contracts, catalog.sessions, activeSeason]);

  /* ── Évolution des inscriptions de la saison sur les 30 derniers jours ── */
  const registrationSeries = useMemo(() => {
    const dayCounts = new Map();
    seasonReservations.forEach((data) => {
      const ms = tsToMs(data?.createdAt);
      if (!ms) return;
      const dayKey = new Date(ms).toISOString().slice(0, 10);
      dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
    });
    const series = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = d.toISOString().slice(0, 10);
      series.push({
        date: dayKey,
        label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        count: dayCounts.get(dayKey) || 0,
      });
    }
    return series;
  }, [seasonReservations]);

  const metricCards = [
    {
      label: `Enfants en attente · ${activeSeason}`,
      value: pendingReservations,
      color: "orange",
      icon: <IconCalendar />,
      href: "/dashboard/reservations",
    },
    {
      label: "Séjours en vente",
      value: metrics.totalSejours,
      color: "green",
      icon: <IconSun />,
      href: "/dashboard/sejours",
    },
    {
      label: "Photos en bibliothèque",
      value: metrics.totalPhotos,
      color: "indigo",
      icon: <IconImage />,
      href: "/dashboard/medias",
    },
    {
      label: "Témoignages",
      value: metrics.totalTemoignages,
      color: "pink",
      icon: <IconQuote />,
      href: "/dashboard/temoignages",
    },
  ];

  return (
    <div className="dash-page">
      {/* Header */}
      <header className="dash-page-header">
        <h1>Tableau de bord</h1>
        <p style={{ textTransform: "capitalize" }}>{today}</p>
      </header>

      {/* Metric cards */}
      <section className="dash-metrics-grid">
        {metricCards.map((card) => (
          <article
            key={card.label}
            className={`dash-card dash-card-${card.color}`}
            style={{ cursor: "pointer" }}
            onClick={() => router.push(card.href)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && router.push(card.href)}
          >
            <div className={`dash-card-icon dash-card-icon-${card.color}`}>
              {card.icon}
            </div>
            <p>{card.label}</p>
            <strong>
              {loadingMetrics ? (
                <span className="dash-skeleton-line" style={{ width: 48, height: 28, display: "inline-block", borderRadius: 6, verticalAlign: "middle" }} />
              ) : card.value ?? "—"}
            </strong>
          </article>
        ))}
      </section>

      {/* Two-column row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16 }}>
        {/* Recent activity */}
        <section className="dash-section">
          <div className="dash-section-head">
            <h2>Activité récente</h2>
            <button
              type="button"
              className="dash-btn"
              style={{ height: 30, fontSize: 12 }}
              onClick={() => router.push("/dashboard/reservations")}
            >
              Tout voir
            </button>
          </div>

          {loadingMetrics ? (
            <div className="dash-activity-list">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="dash-activity-item">
                  <span className="dash-dot" style={{ background: "#e2daf0" }} />
                  <div className="dash-skeleton-line" />
                </div>
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="dash-muted" style={{ fontSize: 13 }}>Aucune réservation récente.</p>
          ) : (
            <div className="dash-activity-list">
              {recentActivity.map((item) => {
                const isValidated = item.status === "validated";
                return (
                  <div
                    key={item.id}
                    className="dash-activity-item"
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push("/dashboard/reservations")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && router.push("/dashboard/reservations")}
                  >
                    <span className={`dash-dot ${isValidated ? "dash-dot-green" : "dash-dot-orange"}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.nom}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--dash-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.sejour}
                      </div>
                    </div>
                    <time style={{ fontSize: 11, color: "var(--dash-muted)", flexShrink: 0 }}>
                      {timeAgo(item.ms)}
                    </time>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section className="dash-section">
          <div className="dash-section-head">
            <h2>Accès rapides</h2>
          </div>
          <div className="dash-quick-grid">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.href}
                type="button"
                className="dash-quick-btn"
                onClick={() => router.push(action.href)}
              >
                <span className="dash-quick-btn-icon">
                  {action.icon || <IconArrow />}
                </span>
                <span>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>{action.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--dash-muted)", fontWeight: 400 }}>{action.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Occupation des séjours + équipes */}
      {!loadingMetrics && <OccupancyTable columns={occupancyColumns} season={activeSeason} />}

      {/* Évolution des inscriptions */}
      {!loadingMetrics && <RegistrationChart series={registrationSeries} />}
    </div>
  );
}
