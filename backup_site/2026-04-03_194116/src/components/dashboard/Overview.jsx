"use client";

import SkeletonLoader from "@/src/components/dashboard/ui/SkeletonLoader";

const quickActions = [
  "Nouvelle réservation",
  "Ajouter un séjour",
  "Uploader des photos",
  "Nouveau témoignage",
  "Éditer une page",
  "Écrire un article",
];

export default function Overview() {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="dash-page">
      <header className="dash-page-header">
        <h1>Bonjour Admin 👋</h1>
        <p>{today}</p>
      </header>

      <section className="dash-metrics-grid">
        <article className="dash-card"><p>Réservations en attente</p><strong>0</strong></article>
        <article className="dash-card"><p>Séjours actifs</p><strong>--</strong></article>
        <article className="dash-card"><p>Photos</p><strong>--</strong></article>
        <article className="dash-card"><p>Témoignages</p><strong>--</strong></article>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Activité récente</h2>
        </div>
        <div className="dash-activity-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="dash-activity-item">
              <span className="dash-dot" />
              <SkeletonLoader variant="line" />
            </div>
          ))}
        </div>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Accès rapides</h2>
        </div>
        <div className="dash-quick-grid">
          {quickActions.map((label) => (
            <button key={label} type="button" className="dash-quick-btn">
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
