/** Contract statuses as the team member sees them (same vocabulary as the HR dashboard). */

const DOCUSIGN = {
  created: { label: "En préparation", tone: "neutral" },
  sent: { label: "À signer", tone: "warning" },
  delivered: { label: "À signer", tone: "warning" },
  completed: { label: "Signé", tone: "success" },
  declined: { label: "Signature refusée", tone: "danger" },
  voided: { label: "Annulé", tone: "danger" },
};

export function signatureStatus(contract) {
  if (!contract?.docusignStatus) {
    return contract?.signedContractStoragePath
      ? { label: "Signé", tone: "success" }
      : { label: "Pas encore envoyé", tone: "neutral" };
  }
  const known = DOCUSIGN[contract.docusignStatus] || { label: contract.docusignStatus, tone: "info" };
  if (known.tone === "warning" && contract.docusignWaitingFor && contract.docusignWaitingFor !== "staff") {
    return { label: "Signé, en attente de ColoCrew", tone: "info" };
  }
  return known;
}

/** True when the person is the one expected to sign. */
export function needsMySignature(contract) {
  return ["sent", "delivered"].includes(contract?.docusignStatus)
    && (!contract.docusignWaitingFor || contract.docusignWaitingFor === "staff");
}

export function contractNet(contract) {
  return Math.max(Number(contract?.netSalary) || 0, 0);
}

export function paymentStatus(contract) {
  const net = contractNet(contract);
  const paid = Math.max(Number(contract?.paidAmount) || 0, 0);
  const validated = contract?.paymentValidated === true || (contract?.paymentValidated == null && net > 0 && paid >= net);
  if (validated) return { label: "Payé", tone: "success" };
  if (paid > 0) return { label: "Payé en partie", tone: "warning" };
  return { label: "À venir", tone: "neutral" };
}
