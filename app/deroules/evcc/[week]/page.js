import { notFound } from "next/navigation";
import DayPlans from "@/src/components/dashboard/DayPlans";

export default async function EvccDayPlansPage({ params }) {
  const { week } = await params;
  if (String(week || "").toUpperCase() !== "S3") notFound();

  return <div className="dp-standalone"><DayPlans stayCode="EVCC" week="S3" /></div>;
}
