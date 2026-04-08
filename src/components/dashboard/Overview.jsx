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

/* ─── Quick actions config ───────────────────────────────────────────── */
const QUICK_ACTIONS = [
  { label: "Voir les réservations", sub: "Gérer et valider", href: "/dashboard/reservations", icon: <IconCalendar /> },
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
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoadingMetrics(true);
      try {
        const [reservationsSnap, sejoursSnap, photosSnap, temoignagesSnap, recentSnap] = await Promise.all([
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
        ]);

        // Count pending reservations
        const pending = reservationsSnap.docs.filter((d) => {
          const status = String(d.data()?.status || "").toLowerCase();
          return !["validated", "deleted", "cancelled"].includes(status);
        }).length;

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
      label: "Réservations en attente",
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
    </div>
  );
}
