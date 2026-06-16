import Transport from "@/src/components/dashboard/Transport";

export default async function DashboardTransportDatePage({ params }) {
  const { date } = await params;
  return <Transport focusDate={date} />;
}
