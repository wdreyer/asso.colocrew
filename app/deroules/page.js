import Link from "next/link";
import { getDayPlanMenuItems } from "@/src/lib/dayPlansSeed";

export default function DeroulesIndexPage() {
  const stays = getDayPlanMenuItems();

  return (
    <main className="dp-standalone">
      <section className="dp-page dp-menu-page">
        <header className="dp-menu-header">
          <div>
            <span className="dp-eyebrow">Été 2026</span>
            <h1>Déroulés des séjours</h1>
            <p>Planning, repas et congés de chaque équipe.</p>
          </div>
        </header>

        <div className="dp-menu-table">
          <div className="dp-menu-row dp-menu-row-head">
            <span>Séjour</span>
            <span>Session</span>
            <span>Dates</span>
            <span>Accès</span>
          </div>
          {stays.map((stay) => {
            const type = stay.code.toLowerCase();
            return (
              <Link key={stay.id} href={stay.href} className={`dp-menu-row is-${type}`}>
                <span>
                  <i>{stay.code}</i>
                  <strong>{stay.name}</strong>
                </span>
                <span>{stay.week}</span>
                <span>{stay.dateLabel}</span>
                <span>Ouvrir</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
