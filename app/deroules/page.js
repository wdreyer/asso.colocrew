import Link from "next/link";
import { getDayPlanMenuItems } from "@/src/lib/dayPlansSeed";

export default function DeroulesIndexPage() {
  const stays = getDayPlanMenuItems();

  return (
    <main className="dp-standalone">
      <section className="dp-page">
        <header className="dp-topbar">
          <div>
            <span className="dp-eyebrow">Deroules publics</span>
            <h1>Deroules des sejours</h1>
            <p>Choisissez un sejour pour ouvrir son planning, ses repas et ses conges.</p>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {stays.map((stay) => (
            <Link
              key={stay.id}
              href={stay.href}
              style={{
                display: "block",
                border: "1px solid #e4ddeb",
                borderRadius: 10,
                background: "#fff",
                color: "#24173d",
                padding: 18,
                textDecoration: "none",
                boxShadow: "0 10px 24px rgba(36, 23, 61, 0.06)",
              }}
            >
              <small style={{ color: "#b72f69", fontWeight: 900, letterSpacing: ".08em" }}>{stay.code} - {stay.week}</small>
              <h2 style={{ margin: "8px 0 4px", fontSize: 22 }}>{stay.name}</h2>
              <p style={{ margin: 0, color: "#6f637a" }}>{stay.dateLabel}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
