"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useStaffData } from "@/src/components/espace/StaffDataContext";
import DayPlanViewer from "@/src/components/espace/DayPlanViewer";
import { teamForSession } from "@/src/components/espace/team";
import { Badge, EmptyState, Loader, PageHeader } from "@/src/components/espace/ui";

/** Day plans of one of the member's sessions (any season: also reached from the history). */
export default function SessionPlanningPage() {
  const { contractId } = useParams();
  const { loading, contracts, memberId, member } = useStaffData();
  if (loading) return <Loader />;
  const contract = contracts.find((item) => item.id === contractId);

  return (
    <>
      <Link href={contract?.archived ? "/espace-equipe/historique" : "/espace-equipe/planning"} className="mb-3 inline-block text-sm font-bold text-[#B8336A]">← Retour</Link>
      {contract ? (
        <>
          <PageHeader eyebrow={`${contract.sessionLabel} · saison ${contract.season}`} title={contract.stayName}>
            <span className="flex flex-wrap items-center gap-2">
              {contract.datesLabel} · {contract.role || "Poste à confirmer"}
              {contract.archived && <Badge>Archivé</Badge>}
            </span>
          </PageHeader>
          {/* Mêmes props que <DayPlans readOnly sessionId team /> du tableau de bord : on pourra
              le brancher ici sans lire les contrats (ni les salaires) des collègues. */}
          <DayPlanViewer
            contract={contract}
            memberId={memberId}
            sessionId={contract.sessionId || ""}
            team={teamForSession(contracts, member, contract.sessionId || contract.id)}
          />
        </>
      ) : (
        <EmptyState title="Session introuvable">Cette session n’est pas liée à l’un de tes contrats.</EmptyState>
      )}
    </>
  );
}
