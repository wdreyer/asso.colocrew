"use client";

import { useState } from "react";
import Link from "next/link";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/src/lib/firebase";
import { contractNet, needsMySignature, paymentStatus, signatureStatus } from "./contracts";
import { euros, longDate } from "./format";
import { Badge, Card, InfoGrid } from "./ui";

/** One contract: post, dates, net salary, signature and payment. */
export default function ContractCard({ contract }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const signature = signatureStatus(contract);
  const payment = paymentStatus(contract);
  const net = contractNet(contract);
  const paid = Math.max(Number(contract.paidAmount) || 0, 0);

  const openSigned = async () => {
    setOpening(true);
    setError("");
    try {
      window.open(await getDownloadURL(ref(storage, contract.signedContractStoragePath)), "_blank", "noopener");
    } catch {
      setError("Le contrat signé n’est pas accessible pour l’instant.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-[#24173D]">{contract.stayName}</p>
          <p className="text-sm text-[#6b5c7b]">{contract.sessionLabel} · {contract.datesLabel}</p>
        </div>
        <Badge tone={signature.tone}>{signature.label}</Badge>
      </div>
      <div className="mt-4">
        <InfoGrid items={[
          ["Poste", contract.role || "À confirmer"],
          ["Salaire net", net ? euros(net) : "À confirmer"],
          ["Début", contract.workStart ? longDate(contract.workStart) : ""],
          ["Fin", contract.workEnd ? longDate(contract.workEnd) : ""],
          ["Paiement", <Badge key="payment" tone={payment.tone}>{payment.label}</Badge>],
          ["Déjà versé", paid && payment.label !== "Payé" ? euros(paid) : ""],
        ]} />
      </div>
      {needsMySignature(contract) && (
        <p className="mt-3 rounded-lg bg-[#fff8e6] px-3 py-2 text-sm text-[#9a6200]">
          Tu as reçu un e-mail DocuSign pour signer ce contrat. Pense à vérifier tes spams.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold">
        {contract.signedContractStoragePath && (
          <button type="button" onClick={openSigned} disabled={opening} className="text-[#B8336A]">{opening ? "Ouverture…" : "Télécharger le contrat signé"}</button>
        )}
        {!contract.signedContractStoragePath && contract.contractFileUrl && (
          <a href={contract.contractFileUrl} target="_blank" rel="noreferrer" className="text-[#B8336A]">Voir le contrat</a>
        )}
        <Link href={`/espace-equipe/planning/${contract.id}`} className="text-[#B8336A]">Déroulé de la session</Link>
      </div>
      {error && <p className="mt-2 text-sm text-[#b42318]">{error}</p>}
    </Card>
  );
}
