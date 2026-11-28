import Link from "next/link";
import DayPlans from "@/src/components/dashboard/DayPlans";
import RhNav from "@/src/components/dashboard/rh/RhNav";

export default async function DashboardSessionDayPlansPage({ params }) {
  const { sessionId } = await params;
  return (
    <div className="dash-page hr-dayplans-page">
      <RhNav />
      <div className="hr-dayplans-back">
        <Link href="/dashboard/rh/deroules">← Toutes les sessions</Link>
      </div>
      <DayPlans sessionId={decodeURIComponent(sessionId)} />
    </div>
  );
}
