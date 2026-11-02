"use client";

import { useStaffData } from "@/src/components/espace/StaffDataContext";
import { directionLabel, myMeeting } from "@/src/components/espace/convoy";
import { longDate, relativeDay, todayIso } from "@/src/components/espace/format";
import { Badge, CardLink, EmptyState, Loader, PageHeader, SectionTitle } from "@/src/components/espace/ui";

function ConvoyCard({ transport, memberId }) {
  const meeting = myMeeting(transport, memberId);
  return (
    <CardLink href={`/espace-equipe/convoyages/${transport.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-[#24173D]">{transport.departureCity || "?"} → {transport.arrivalCity || "?"}</p>
          <p className="text-sm capitalize text-[#6b5c7b]">{longDate(transport.date)}</p>
          <p className="mt-1 text-sm text-[#24173D]">RDV {meeting.time ? <strong>{meeting.time}</strong> : "horaire à confirmer"} · {meeting.point}</p>
        </div>
        <Badge tone={transport.direction === "retour" ? "warning" : "success"}>{directionLabel(transport)}</Badge>
      </div>
    </CardLink>
  );
}

/** Convoys of the member: those whose `staffMemberIds` contain their memberId. */
export default function ConvoyagesPage() {
  const { loading, currentTransports, memberId } = useStaffData();
  if (loading) return <Loader />;
  const today = todayIso();
  const upcoming = currentTransports.filter((transport) => String(transport.date || "9999") >= today);
  const past = currentTransports.filter((transport) => String(transport.date || "9999") < today).reverse();

  return (
    <>
      <PageHeader eyebrow="Convoyages" title="Mes convoyages">
        Horaires, points de RDV, billets et liste des enfants pour l’appel.
      </PageHeader>
      {upcoming.length ? (
        <div className="space-y-3">
          {upcoming.map((transport) => (
            <div key={transport.id}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#9a8cab]">{relativeDay(transport.date)}</p>
              <ConvoyCard transport={transport} memberId={memberId} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Aucun convoyage à venir">Les convoyages qui te sont attribués apparaîtront ici.</EmptyState>
      )}
      {past.length > 0 && (
        <>
          <SectionTitle>Déjà effectués cette saison</SectionTitle>
          <div className="space-y-3">{past.map((transport) => <ConvoyCard key={transport.id} transport={transport} memberId={memberId} />)}</div>
        </>
      )}
    </>
  );
}
