"use client";

import Link from "next/link";
import { useStaffData } from "@/src/components/espace/StaffDataContext";
import ContractCard from "@/src/components/espace/ContractCard";
import { EmptyState, Loader, PageHeader } from "@/src/components/espace/ui";

/** Contracts of the current season; older ones live in the history. */
export default function ContratsPage() {
  const { loading, contracts, activeSeason } = useStaffData();
  if (loading) return <Loader />;
  const current = contracts.filter((contract) => !contract.archived);

  return (
    <>
      <PageHeader eyebrow={`Saison ${activeSeason}`} title="Mes contrats">
        Poste, dates, salaire, signature et paiement de chacun de tes contrats.
      </PageHeader>
      {current.length ? (
        <div className="space-y-3">{current.map((contract) => <ContractCard key={contract.id} contract={contract} />)}</div>
      ) : (
        <EmptyState title="Aucun contrat en cours">Ton contrat apparaîtra ici dès qu’il sera préparé par ColoCrew.</EmptyState>
      )}
      <p className="mt-6 text-center text-sm text-[#6b5c7b]">
        Contrats des saisons passées : <Link href="/espace-equipe/historique" className="font-bold text-[#B8336A]">historique</Link>.
      </p>
    </>
  );
}
