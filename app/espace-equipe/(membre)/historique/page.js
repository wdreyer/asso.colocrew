"use client";

import Link from "next/link";
import { useStaffData } from "@/src/components/espace/StaffDataContext";
import ContractCard from "@/src/components/espace/ContractCard";
import { directionLabel } from "@/src/components/espace/convoy";
import { shortDate } from "@/src/components/espace/format";
import { Badge, EmptyState, Loader, PageHeader } from "@/src/components/espace/ui";

/** Every season, archived ones included: contracts (with their session) and convoys. */
export default function HistoriquePage() {
  const { loading, contracts, transports, archivedSeasons } = useStaffData();
  if (loading) return <Loader />;

  const seasons = [...new Set([...contracts, ...transports].map((record) => record.season || "Sans date"))]
    .sort((left, right) => right.localeCompare(left));

  return (
    <>
      <PageHeader eyebrow="Toutes les saisons" title="Mon historique">
        Tes contrats, sessions et convoyages, saison par saison.
      </PageHeader>
      {!seasons.length && <EmptyState title="Pas encore d’historique">Tes saisons avec ColoCrew s’afficheront ici.</EmptyState>}
      <div className="space-y-8">
        {seasons.map((season) => {
          const seasonContracts = contracts.filter((contract) => (contract.season || "Sans date") === season);
          const seasonTransports = transports.filter((transport) => (transport.season || "Sans date") === season);
          return (
            <section key={season}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-2xl font-bold text-[#24173D]">Saison {season}</h2>
                {archivedSeasons.has(season) && <Badge>Archivée</Badge>}
              </div>
              <div className="space-y-3">
                {seasonContracts.map((contract) => <ContractCard key={contract.id} contract={contract} />)}
              </div>
              {seasonTransports.length > 0 && (
                <div className="mt-3 rounded-2xl border border-[#ece3f3] bg-white p-4">
                  <p className="mb-2 font-bold text-[#24173D]">Convoyages ({seasonTransports.length})</p>
                  <ul className="divide-y divide-[#f1ebf6]">
                    {seasonTransports.map((transport) => (
                      <li key={transport.id}>
                        <Link href={`/espace-equipe/convoyages/${transport.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="min-w-0 truncate"><strong className="capitalize">{shortDate(transport.date)}</strong> · {transport.departureCity || "?"} → {transport.arrivalCity || "?"}</span>
                          <Badge tone={transport.direction === "retour" ? "warning" : "success"}>{directionLabel(transport)}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
