"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useStaffAuth } from "@/src/contexts/StaffAuthContext";
import { useStaffData } from "@/src/components/espace/StaffDataContext";
import RollCall from "@/src/components/espace/RollCall";
import {
  COMMUNICATION_ITEMS, CONSIGNES_ITEMS, EMERGENCY_PHONES, childCount, directionLabel,
  myMeeting, myPortions, myTickets, orderedPortions, passengersInMyScope, segmentPathLabel,
} from "@/src/components/espace/convoy";
import { daysUntil, longDate, personName } from "@/src/components/espace/format";
import { Badge, Card, EmptyState, InfoGrid, Loader, Notice, PageHeader, SectionTitle } from "@/src/components/espace/ui";

function Portion({ portion, index }) {
  return (
    <Card>
      <p className="font-bold text-[#24173D]">{index + 1}. {segmentPathLabel(portion) || "Trajet"}{portion._type === "branch" ? " · embranchement" : ""}</p>
      <div className="mt-3">
        <InfoGrid items={[
          ["Point de RDV", portion.meetingPoint],
          ["Heure de RDV", portion.meetingTime],
          ["Départ", portion.departureTime],
          ["Arrivée", portion.arrivalTime],
          ["Train / véhicule", `${portion.mode || ""} ${portion.number || ""}`.trim()],
          ["Voie / quai", portion.platform],
        ]} />
      </div>
      {portion.instructions && <p className="mt-3 rounded-lg bg-[#fff7ed] px-3 py-2 text-sm text-[#92400e]">{portion.instructions}</p>}
    </Card>
  );
}

export default function ConvoyDetailPage() {
  const { transportId } = useParams();
  const { member } = useStaffAuth();
  const { loading, transports, memberId } = useStaffData();
  if (loading) return <Loader />;
  const transport = transports.find((item) => item.id === transportId);
  if (!transport) {
    return (
      <>
        <Link href="/espace-equipe/convoyages" className="mb-3 inline-block text-sm font-bold text-[#B8336A]">← Retour</Link>
        <EmptyState title="Convoyage introuvable">Ce convoyage ne t’est pas (ou plus) attribué.</EmptyState>
      </>
    );
  }

  const portions = myPortions(transport, memberId);
  const shownPortions = portions.length ? portions : orderedPortions(transport);
  const meeting = myMeeting(transport, memberId);
  const tickets = myTickets(transport, memberId);
  const { passengers, scoped } = passengersInMyScope(transport, memberId);
  const team = (transport.staff || []).map((entry) => entry.name).filter(Boolean);
  const days = daysUntil(transport.date);
  const canCheck = !transport.archived && days !== null && days <= 1 && days >= -1;

  return (
    <>
      <Link href={transport.archived ? "/espace-equipe/historique" : "/espace-equipe/convoyages"} className="mb-3 inline-block text-sm font-bold text-[#B8336A]">← Retour</Link>
      <PageHeader eyebrow={`Convoyage ${directionLabel(transport).toLowerCase()}`} title={`${transport.departureCity || "?"} → ${transport.arrivalCity || "?"}`}>
        <span className="capitalize">{longDate(transport.date)}</span>
        {transport.archived && <Badge className="ml-2">Archivé</Badge>}
      </PageHeader>

      <Card>
        <InfoGrid items={[
          ["Mon RDV", meeting.point],
          ["Heure de RDV", meeting.time || "À confirmer"],
          ["Train", `${transport.trainType || ""} ${transport.trainNumber || ""}`.trim()],
          ["Voie / quai", transport.platform],
          ["Départ", transport.departureTime],
          ["Arrivée", transport.arrivalTime],
          ["Enfants", `${childCount(passengers)}${scoped ? " (ma partie)" : ""}`],
          ["Équipe", team.join(", ")],
        ]} />
      </Card>

      <SectionTitle>{portions.length ? "Mes trajets" : "Trajets"}</SectionTitle>
      {!portions.length && shownPortions.length > 0 && <div className="mb-3"><Notice>Aucun tronçon ne t’est encore attribué : voici le trajet complet.</Notice></div>}
      <div className="space-y-3">
        {shownPortions.map((portion, index) => <Portion key={portion.id || index} portion={portion} index={index} />)}
        {!shownPortions.length && <EmptyState title="Détail du trajet à venir" />}
      </div>

      {tickets.length > 0 && (
        <>
          <SectionTitle>Billets et documents</SectionTitle>
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Card key={ticket.key}>
                <p className="font-bold text-[#24173D]">{ticket.title}</p>
                {ticket.route && <p className="text-sm text-[#6b5c7b]">{ticket.route}</p>}
                <p className="mt-1 text-sm text-[#24173D]">
                  {[ticket.departureTime && `Départ ${ticket.departureTime}`, ticket.arrivalTime && `Arrivée ${ticket.arrivalTime}`, ticket.bookingReference && `Réf. ${ticket.bookingReference}`].filter(Boolean).join(" · ")}
                </p>
                {ticket.notes && <p className="mt-1 text-sm text-[#5b4d6b]">{ticket.notes}</p>}
                {ticket.url && <a href={ticket.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-[#B8336A]">Ouvrir le billet →</a>}
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Enfants {canCheck ? "· appel" : ""}</SectionTitle>
      {!canCheck && !transport.archived && <p className="mb-2 text-xs text-[#6b5c7b]">Le pointage s’ouvre la veille du convoyage.</p>}
      <RollCall transport={transport} passengers={passengers} canCheck={canCheck} member={{ id: memberId, name: personName(member) }} />

      <SectionTitle>Consignes</SectionTitle>
      <Card>
        <details>
          <summary className="cursor-pointer font-bold text-[#24173D]">Consignes convoyage ColoCrew</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#5b4d6b]">
            {CONSIGNES_ITEMS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="mt-4 font-bold text-[#24173D]">Communication</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#5b4d6b]">
            {COMMUNICATION_ITEMS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      </Card>

      {transport.notes && (
        <>
          <SectionTitle>Notes du trajet</SectionTitle>
          <Card><p className="whitespace-pre-line text-sm leading-relaxed text-[#5b4d6b]">{transport.notes}</p></Card>
        </>
      )}

      <SectionTitle>Urgences</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {EMERGENCY_PHONES.map((phone) => (
          <a key={phone.number} href={`tel:${phone.number}`} className="inline-flex min-h-11 items-center rounded-full bg-[#b91c1c] px-5 text-sm font-bold text-white">
            {phone.label} · {phone.display}
          </a>
        ))}
      </div>
      {(transport.emergencyContact || transport.emergencyPhone) && (
        <p className="mt-2 text-sm text-[#991b1b]"><strong>{transport.emergencyContact || "Urgence"}</strong>{transport.emergencyPhone ? ` · ${transport.emergencyPhone}` : ""}</p>
      )}
    </>
  );
}
