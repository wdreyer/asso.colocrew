import Link from "next/link";
import { getDayPlanMenuItems } from "@/src/lib/dayPlansSeed";

export default function DeroulesIndexPage() {
  const stays = getDayPlanMenuItems();
  const weeks = ["S1", "S2", "S3", "S4"];
  const rows = [
    { code: "MCSC", name: "My Creative Surf Camp" },
    { code: "EVCC", name: "Eaux Vives Creative Camp" },
  ].map((row) => ({
    ...row,
    stays: Object.fromEntries(stays.filter((stay) => stay.code === row.code).map((stay) => [stay.week, stay])),
  }));

  return (
    <main className="dp-standalone">
      <section className="dp-page dp-menu-page">
        <header className="dp-menu-header">
          <div>
            <span className="dp-eyebrow">Ete 2026</span>
            <h1>Deroules des sejours</h1>
            <p>Planning, repas et conges de chaque equipe.</p>
          </div>
        </header>

        <div className="dp-menu-matrix">
          <div className="dp-menu-matrix-head">
            <span>Sejour</span>
            {weeks.map((week) => <span key={week}>{week}</span>)}
          </div>

          {rows.map((row) => {
            const type = row.code.toLowerCase();
            return (
              <div key={row.code} className={`dp-menu-matrix-row is-${type}`}>
                <div className="dp-menu-stay-label">
                  <i>{row.code}</i>
                  <strong>{row.name}</strong>
                </div>
                {weeks.map((week) => {
                  const stay = row.stays[week];
                  return stay ? (
                    <Link key={week} href={stay.href} className="dp-menu-week-card">
                      <strong>{week}</strong>
                      <span>{stay.dateLabel}</span>
                      <em>Ouvrir</em>
                    </Link>
                  ) : (
                    <div key={week} className="dp-menu-week-card is-empty">
                      <strong>{week}</strong>
                      <span>Pas de sejour</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
