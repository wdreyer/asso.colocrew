"use client";

import { useStaffData } from "@/src/components/espace/StaffDataContext";
import { CardLink, EmptyState, Loader, PageHeader, Badge } from "@/src/components/espace/ui";
import { todayIso } from "@/src/components/espace/format";

/** Sessions of the active season, from the member's contracts. */
export default function PlanningPage() {
  const { loading, currentContracts, activeSeason } = useStaffData();
  if (loading) return <Loader />;
  const today = todayIso();

  return (
    <>
      <PageHeader eyebrow={`Saison ${activeSeason}`} title="Mon planning">
        Tes sessions de la saison et leur déroulé jour par jour.
      </PageHeader>
      {currentContracts.length ? (
        <div className="space-y-3">
          {currentContracts.map((contract) => {
            const past = String(contract.sessionEnd || "9999") < today;
            const ongoing = !past && String(contract.sessionStart || "9999") <= today;
            return (
              <CardLink key={contract.id} href={`/espace-equipe/planning/${contract.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-[#24173D]">{contract.stayName}</p>
                    <p className="text-sm text-[#6b5c7b]">{contract.sessionLabel} · {contract.datesLabel}</p>
                    <p className="mt-1 text-sm font-semibold text-[#B8336A]">{contract.role || "Poste à confirmer"}</p>
                  </div>
                  {ongoing ? <Badge tone="success">En cours</Badge> : past ? <Badge>Terminée</Badge> : <Badge tone="pink">À venir</Badge>}
                </div>
                <p className="mt-3 text-sm font-bold text-[#B8336A]">Voir le déroulé →</p>
              </CardLink>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Pas encore de session cette saison">
          Dès qu’un contrat te sera attribué, la session et son déroulé apparaîtront ici.
        </EmptyState>
      )}
    </>
  );
}
