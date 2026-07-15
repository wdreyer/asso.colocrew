"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

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

/* ─── Occupation / équipes lookup tables ────────────────────────────── */
const WEEK_ORDER = ["S1", "S2", "S3", "S4"];
const WEEK_LABELS = {
  "2026-07-06": "S1",
  "2026-07-20": "S2",
  "2026-08-03": "S3",
  "2026-08-17": "S4",
};
const STAY_LABELS = {
  "my-creative-surf-camp": "MCSC",
  "eaux-vives-creative-camp": "EVCC",
};
const STAY_CAPACITY = { MCSC: 35, EVCC: 30 };

function canonicalStaySlug(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "mycreativesurfcamp") return "my-creative-surf-camp";
  if (normalized === "eauxvivescreativecamp") return "eaux-vives-creative-camp";
  return value;
}

function resolveStayCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Non renseigné";
  const upper = raw.toUpperCase();
  if (STAY_CAPACITY[upper]) return upper;
  return STAY_LABELS[canonicalStaySlug(raw)] || raw;
}

/* ─── Quick actions config ───────────────────────────────────────────── */
const QUICK_ACTIONS = [
  { label: "Voir les réservations", sub: "Gérer et valider", href: "/dashboard/reservations", icon: <IconCalendar /> },
  { label: "Suivi financier", sub: "CA, paiements et restes", href: "/dashboard/finances", icon: <IconFinance /> },
  { label: "Gérer les séjours", sub: "Créer, éditer, supprimer", href: "/dashboard/sejours", icon: <IconSun /> },
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

function childCountFromReservation(data) {
  const children = Array.isArray(data?.minor?.children) ? data.minor.children.length : 0;
  if (children > 0) return children;
  const declared = Number(data?.minor?.numberOfChildren);
  return Number.isFinite(declared) && declared > 0 ? declared : 1;
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

function OccupancyTable({ columns }) {
  if (columns.length === 0) return null;

  return (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>Occupation des séjours</h2>
        <span style={{ fontSize: 11, color: "var(--dash-muted)" }}>Inscriptions validées · taux de remplissage · équipe</span>
      </div>
      <div className="hr-table-scroll">
        <table className="dash-occupancy-table">
          <tbody>
            <tr className="dash-occ-head-row">
              <td className="dash-occ-row-label">Semaine</td>
              {columns.map((col) => <td key={`${col.week}-${col.stay}-w`}>{col.week}</td>)}
            </tr>
            <tr className="dash-occ-head-row">
              <td className="dash-occ-row-label">Séjour</td>
              {columns.map((col) => <td key={`${col.week}-${col.stay}-n`}>{col.stay}</td>)}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Inscriptions validées</td>
              {columns.map((col) => (
                <td key={`${col.week}-${col.stay}-v`}><strong>{col.validated}</strong></td>
              ))}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Taux remplissage</td>
              {columns.map((col) => (
                <td key={`${col.week}-${col.stay}-r`}>
                  {col.rate === null ? "—" : (
                    <span className={`dash-occ-badge dash-occ-badge-${rateTone(col.rate)}`}>
                      {col.rate.toFixed(2).replace(".", ",")}%
                    </span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Animateurs</td>
              {columns.map((col) => (
                <td key={`${col.week}-${col.stay}-a`}>{col.animCount || "—"}</td>
              ))}
            </tr>
            <tr>
              <td className="dash-occ-row-label">Équipe totale</td>
              {columns.map((col) => (
                <td key={`${col.week}-${col.stay}-s`}>{col.staffCount || "—"}</td>
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
    pendingReservations: null,
    totalSejours: null,
    totalPhotos: null,
    totalTemoignages: null,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [occupancyColumns, setOccupancyColumns] = useState([]);
  const [registrationSeries, setRegistrationSeries] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoadingMetrics(true);
      try {
        const [reservationsSnap, sejoursSnap, photosSnap, temoignagesSnap, recentSnap, contractsSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.RESERVATIONS)),
          getDocs(collection(db, COLLECTIONS.SEJOURS)),
          getDocs(collection(db, COLLECTIONS.PHOTOS)),
          getDocs(collection(db, "retours")),
          getDocs(
            query(
              collection(db, COLLECTIONS.RESERVATIONS),
              orderBy("createdAt", "desc"),
              limit(6),
            ),
          ),
          getDocs(collection(db, COLLECTIONS.STAFF_CONTRACTS)),
        ]);

        // Count pending reservations
        const pending = reservationsSnap.docs.reduce((total, reservationDoc) => {
          const data = reservationDoc.data();
          const status = String(data?.status || "").toLowerCase();
          return ["validated", "deleted", "cancelled"].includes(status)
            ? total
            : total + childCountFromReservation(data);
        }, 0);

        setMetrics({
          pendingReservations: pending,
          totalSejours: sejoursSnap.size,
          totalPhotos: photosSnap.size,
          totalTemoignages: temoignagesSnap.size,
        });

        const activity = recentSnap.docs.map((d) => {
          const data = d.data();
          const legal = data?.legal || {};
          const nom = `${legal?.firstName || legal?.prenom || ""} ${legal?.lastName || legal?.nom || ""}`.trim() || data?.name || "Anonyme";
          const sejour = data?.sejour?.name || data?.sejourName || "séjour";
          const ms = tsToMs(data?.createdAt);
          const status = String(data?.status || "").toLowerCase();
          return { id: d.id, nom, sejour, ms, status };
        });

        setRecentActivity(activity);

        /* ── Occupation (inscriptions validées) par semaine × séjour ── */
        const occupancyMap = new Map();
        const ensureCell = (week, stay) => {
          const key = `${week}|${stay}`;
          if (!occupancyMap.has(key)) {
            occupancyMap.set(key, { week, stay, validated: 0, staffIds: new Set(), animIds: new Set() });
          }
          return occupancyMap.get(key);
        };

        reservationsSnap.docs.forEach((reservationDoc) => {
          const data = reservationDoc.data();
          if (String(data?.status || "").toLowerCase() !== "validated") return;
          const startDate = String(data?.sejour?.startDate || data?.sejourStartDate || "").slice(0, 10);
          const week = WEEK_LABELS[startDate];
          if (!week) return;
          const stay = resolveStayCode(data?.sejour?.name || data?.sejourName);
          const cell = ensureCell(week, stay);
          cell.validated += childCountFromReservation(data);
        });

        contractsSnap.docs.forEach((contractDoc) => {
          const data = contractDoc.data();
          const week = data?.week;
          if (!week) return;
          const stay = resolveStayCode(data?.stayCode || data?.stayName);
          const cell = ensureCell(week, stay);
          const memberKey = data?.memberId || data?.memberName || contractDoc.id;
          cell.staffIds.add(memberKey);
          if (String(data?.role || "").toLowerCase().includes("anim")) cell.animIds.add(memberKey);
        });

        const columns = [...occupancyMap.values()]
          .filter((cell) => cell.validated > 0 || cell.staffIds.size > 0)
          .map((cell) => {
            const capacity = STAY_CAPACITY[cell.stay] || null;
            return {
              week: cell.week,
              stay: cell.stay,
              validated: cell.validated,
              capacity,
              rate: capacity ? Math.min(Math.round((cell.validated / capacity) * 10000) / 100, 100) : null,
              staffCount: cell.staffIds.size,
              animCount: cell.animIds.size,
            };
          })
          .sort((a, b) => {
            const weekDiff = WEEK_ORDER.indexOf(a.week) - WEEK_ORDER.indexOf(b.week);
            return weekDiff !== 0 ? weekDiff : a.stay.localeCompare(b.stay, "fr");
          });
        setOccupancyColumns(columns);

        /* ── Évolution des inscriptions sur les 30 derniers jours ── */
        const dayCounts = new Map();
        reservationsSnap.docs.forEach((reservationDoc) => {
          const ms = tsToMs(reservationDoc.data()?.createdAt);
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
        setRegistrationSeries(series);
      } catch {
        // silently fail — dashboard still usable
      } finally {
        setLoadingMetrics(false);
      }
    }
    loadData();
  }, []);

  const metricCards = [
    {
      label: "Enfants en attente",
      value: metrics.pendingReservations,
      color: "orange",
      icon: <IconCalendar />,
      href: "/dashboard/reservations",
    },
    {
      label: "Séjours actifs",
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
      {!loadingMetrics && <OccupancyTable columns={occupancyColumns} />}

      {/* Évolution des inscriptions */}
      {!loadingMetrics && <RegistrationChart series={registrationSeries} />}
    </div>
  );
}
