import HumanResources from "@/src/components/dashboard/HumanResources";

// Fiche d'une personne. `?onglet=documents` ouvre un onglet, `?modifier=1` le profil en édition.
export default async function DashboardStaffMemberPage({ params, searchParams }) {
  const { memberId } = await params;
  const { onglet = "", modifier = "" } = await searchParams;
  return (
    <HumanResources
      view="fiche"
      memberId={decodeURIComponent(memberId)}
      initialTab={String(onglet)}
      startEdit={modifier === "1"}
    />
  );
}
