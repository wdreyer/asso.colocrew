"use client";

import Link from "next/link";
import { useStaffData } from "@/src/components/espace/StaffDataContext";
import { needsMySignature } from "@/src/components/espace/contracts";
import { directionLabel, myMeeting } from "@/src/components/espace/convoy";
import { daysUntil, longDate, personName, relativeDay, todayIso } from "@/src/components/espace/format";
import { Badge, Card, CardLink, EmptyState, Loader, Notice, PageHeader, SectionTitle } from "@/src/components/espace/ui";

const PROFILE_FIELDS = [["phone", "téléphone"], ["address", "adresse"], ["dateOfBirth", "date de naissance"], ["birthPlace", "lieu de naissance"], ["nationality", "nationalité"]];

function ActionItem({ href, tone, title, children }) {
  return (
    <CardLink href={href} className="flex items-start gap-3">
      <Badge tone={tone}>{tone === "danger" ? "Urgent" : "À faire"}</Badge>
      <span className="min-w-0">
        <strong className="block text-[#24173D]">{title}</strong>
        <span className="text-sm text-[#6b5c7b]">{children}</span>
      </span>
    </CardLink>
  );
}

export default function EspaceAccueilPage() {
  const data = useStaffData();
  if (data.loading) return <Loader />;

  const today = todayIso();
  const { member, memberId, upcomingContracts, upcomingTransports, currentContracts, documentSituation, errors } = data;
  const ongoing = upcomingContracts.find((contract) => String(contract.sessionStart) <= today);
  const next = ongoing || upcomingContracts[0];
  const nextTransport = upcomingTransports[0];
  const missingDocs = documentSituation.filter((item) => item.state === "missing" || item.state === "rejected");
  const toSign = currentContracts.filter(needsMySignature);
  const missingProfile = PROFILE_FIELDS.filter(([key]) => !String(member?.[key] || "").trim());

  return (
    <>
      <PageHeader eyebrow={`Saison ${data.activeSeason}`} title={`Bonjour ${member?.firstName || personName(member) || ""} !`}>
        Tout ce qui te concerne chez ColoCrew : plannings, convoyages, contrats et documents.
      </PageHeader>

      {errors.length > 0 && <div className="mb-4"><Notice tone="danger">Une partie des informations n’a pas pu être chargée. Réessaie plus tard.</Notice></div>}

      <SectionTitle>{ongoing ? "Session en cours" : "Prochaine session"}</SectionTitle>
      {next ? (
        <CardLink href={`/espace-equipe/planning/${next.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-[#24173D]">{next.stayName}</p>
              <p className="text-sm text-[#6b5c7b]">{next.sessionLabel} · {next.datesLabel}</p>
              <p className="mt-1 text-sm font-semibold text-[#B8336A]">{next.role || "Poste à confirmer"}</p>
            </div>
            {!ongoing && daysUntil(next.sessionStart) !== null && <Badge tone="pink">{relativeDay(next.sessionStart)}</Badge>}
          </div>
          <p className="mt-3 text-sm font-bold text-[#B8336A]">Voir le déroulé →</p>
        </CardLink>
      ) : (
        <EmptyState title="Aucune session prévue pour l’instant">Tes sessions apparaîtront ici dès que ton contrat sera préparé.</EmptyState>
      )}

      <SectionTitle>Prochain convoyage</SectionTitle>
      {nextTransport ? (
        <CardLink href={`/espace-equipe/convoyages/${nextTransport.id}`}>
          <p className="text-lg font-bold text-[#24173D]">{directionLabel(nextTransport)} · {nextTransport.departureCity || "?"} → {nextTransport.arrivalCity || "?"}</p>
          <p className="text-sm capitalize text-[#6b5c7b]">{longDate(nextTransport.date)} ({relativeDay(nextTransport.date)})</p>
          {(() => {
            const meeting = myMeeting(nextTransport, memberId);
            return <p className="mt-1 text-sm font-semibold text-[#24173D]">RDV {meeting.time ? `à ${meeting.time} ` : ""}· {meeting.point}</p>;
          })()}
        </CardLink>
      ) : (
        <EmptyState title="Aucun convoyage à venir" />
      )}

      <SectionTitle>Actions à faire</SectionTitle>
      <div className="space-y-3">
        {toSign.map((contract) => (
          <ActionItem key={contract.id} href="/espace-equipe/contrats" tone="danger" title={`Contrat à signer · ${contract.sessionLabel}`}>
            Tu as reçu un e-mail DocuSign pour le signer.
          </ActionItem>
        ))}
        {missingDocs.map((item) => (
          <ActionItem key={item.type.key} href="/espace-equipe/documents" tone={item.state === "rejected" ? "danger" : "warning"} title={`${item.type.label} ${item.state === "rejected" ? "à remplacer" : "à déposer"}`}>
            Dépose le fichier depuis l’onglet Documents.
          </ActionItem>
        ))}
        {missingProfile.length > 0 && (
          <ActionItem href="/espace-equipe/profil" tone="warning" title="Compléter mon profil">
            Manquant : {missingProfile.map(([, label]) => label).join(", ")}.
          </ActionItem>
        )}
        {!toSign.length && !missingDocs.length && !missingProfile.length && (
          <Card><p className="text-sm font-semibold text-[#15803d]">Tout est en ordre, rien à faire pour le moment.</p></Card>
        )}
      </div>

      <p className="mt-8 text-center text-sm text-[#6b5c7b]">
        Tes saisons précédentes sont dans <Link href="/espace-equipe/historique" className="font-bold text-[#B8336A]">l’historique</Link>.
      </p>
    </>
  );
}
