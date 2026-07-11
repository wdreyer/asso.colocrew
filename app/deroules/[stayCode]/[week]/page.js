import { notFound } from "next/navigation";
import DayPlans from "@/src/components/dashboard/DayPlans";
import { findDayPlanConfig } from "@/src/lib/dayPlansSeed";

export default async function StayDayPlansPage({ params }) {
  const { stayCode, week } = await params;
  const config = findDayPlanConfig(stayCode, week);

  if (!config) notFound();

  return (
    <div className="dp-standalone">
      <DayPlans stayCode={config.stay.code} week={config.stay.week} />
    </div>
  );
}
