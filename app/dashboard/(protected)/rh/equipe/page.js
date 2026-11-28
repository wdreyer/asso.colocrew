import HumanResources from "@/src/components/dashboard/HumanResources";

// `?session=<id>` ouvre le tableau filtré sur une session (lien depuis la vue d'ensemble).
export default async function DashboardStaffTeamPage({ searchParams }) {
  const { session = "" } = await searchParams;
  return <HumanResources view="equipe" initialSession={String(session)} />;
}
