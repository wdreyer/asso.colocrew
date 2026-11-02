import Link from "next/link";
import DayPlans from "@/src/components/dashboard/DayPlans";

export default async function DashboardSessionDayPlansPage({ params }) {
  const { sessionId } = await params;
  return (
    <div className="dash-page hr-dayplans-page">
      <div className="hr-dayplans-back">
        <Link href="/dashboard/rh/deroules">← Toutes les sessions</Link>
        <Link href="/dashboard/rh">Ressources humaines</Link>
      </div>
      <DayPlans sessionId={decodeURIComponent(sessionId)} />
    </div>
  );
}
