"use client";

import { useState } from "react";
import { useStaffAuth } from "@/src/contexts/StaffAuthContext";
import { useStaffData } from "@/src/components/espace/StaffDataContext";
import { uploadStaffDocument, validateStaffDocumentFile } from "@/src/lib/staffDocuments";
import { dateTimeLabel, personName } from "@/src/components/espace/format";
import { Badge, Card, Loader, Notice, PageHeader, buttonPrimary } from "@/src/components/espace/ui";

const STATES = {
  missing: { label: "Manquant", tone: "danger" },
  pending: { label: "À vérifier", tone: "warning" },
  validated: { label: "Validé", tone: "success" },
  rejected: { label: "À remplacer", tone: "danger" },
};

function DocumentRow({ item, member }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);
  const [sending, setSending] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const state = STATES[item.state];

  const choose = (list) => {
    const next = Array.from(list || []);
    const problem = next.map(validateStaffDocumentFile).find(Boolean) || "";
    setFiles(problem ? [] : next);
    setError(problem);
    setSent(0);
  };

  const send = async () => {
    if (!files.length) return;
    setSending(true);
    setError("");
    try {
      for (const file of files) {
        await uploadStaffDocument({ member: { ...member, name: personName(member) }, documentType: item.type.key, file, source: "espace-equipe" });
      }
      setSent(files.length);
      setFiles([]);
      setInputKey((value) => value + 1);
    } catch (uploadError) {
      setError(uploadError?.message || "Envoi impossible. Réessaie.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-[#24173D]">{item.type.label}</p>
          {item.latest && <p className="text-xs text-[#6b5c7b]">Dernier envoi : {item.latest.originalName || "fichier"}{dateTimeLabel(item.latest.createdAt) ? ` · ${dateTimeLabel(item.latest.createdAt)}` : ""}</p>}
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      {item.state === "rejected" && item.latest?.rejectionReason && <p className="mt-2 text-sm text-[#b42318]">{item.latest.rejectionReason}</p>}
      {item.locked ? (
        <p className="mt-3 text-sm text-[#15803d]">Document validé : le dépôt est fermé.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block cursor-pointer rounded-xl border border-dashed border-[#d6c7e3] px-3 py-3 text-sm text-[#6b5c7b]">
            <input key={inputKey} type="file" multiple accept={item.type.accept} className="sr-only" onChange={(event) => choose(event.target.files)} disabled={sending} />
            {files.length ? `${files.length} fichier(s) : ${files.map((file) => file.name).join(", ")}` : item.state === "missing" ? "Choisir un PDF, JPG ou PNG" : "Envoyer une nouvelle version"}
          </label>
          {files.length > 0 && <button type="button" onClick={send} disabled={sending} className={`${buttonPrimary} w-full`}>{sending ? "Envoi…" : "Transmettre"}</button>}
          {error && <p className="text-sm font-bold text-[#b42318]">{error}</p>}
          {sent > 0 && <p className="text-sm font-bold text-[#15803d]">{sent} document{sent > 1 ? "s" : ""} transmis, vérification par ColoCrew à venir.</p>}
        </div>
      )}
    </Card>
  );
}

export default function DocumentsPage() {
  const { member } = useStaffAuth();
  const { loading, documentSituation } = useStaffData();
  if (loading) return <Loader />;

  return (
    <>
      <PageHeader eyebrow="Dossier administratif" title="Mes documents">
        Dépose ton diplôme, ta pièce d’identité et tes vaccins ou certificat médical. Ils sont vérifiés par ColoCrew.
      </PageHeader>
      {!member && <div className="mb-4"><Notice tone="danger">Ton dossier n’est pas encore prêt. Contacte ColoCrew.</Notice></div>}
      <div className="space-y-3">
        {member && documentSituation.map((item) => <DocumentRow key={item.type.key} item={item} member={member} />)}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-[#8a7b99]">PDF, JPG ou PNG, 10 Mo maximum par fichier. Tes fichiers ne sont visibles que par l’équipe administrative de ColoCrew.</p>
    </>
  );
}
