"use client";

import { useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import {
  STAFF_DOCUMENT_STATUS,
  STAFF_DOCUMENT_TYPES,
  latestDocumentByType,
  publicAssignmentsForMember,
  uploadStaffDocument,
} from "@/src/lib/staffDocuments";

function memberName(member) {
  return member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim();
}

function statusOf(document) {
  if (!document) return { key: "missing", label: "Manquant", tone: "missing" };
  const status = STAFF_DOCUMENT_STATUS[document.status] || STAFF_DOCUMENT_STATUS.pending;
  return { key: document.status || "pending", ...status };
}

function completionFor(member, documents) {
  const states = STAFF_DOCUMENT_TYPES.map((type) => latestDocumentByType(documents, member.id, type.key));
  const validated = states.filter((document) => document?.status === "validated" && document.locked).length;
  const pending = states.filter((document) => document && document.status !== "validated").length;
  return { validated, pending, missing: STAFF_DOCUMENT_TYPES.length - states.filter(Boolean).length };
}

export default function StaffDocumentsPanel({ members, contracts, documents, onDocumentChange }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const rows = useMemo(() => members.map((member) => ({
    member,
    assignments: publicAssignmentsForMember(member.id, contracts),
    completion: completionFor(member, documents),
  })).filter((row) => {
    const needle = search.trim().toLocaleLowerCase("fr");
    const matchesSearch = !needle || `${memberName(row.member)} ${row.assignments.map((assignment) => `${assignment.role} ${assignment.stay} ${assignment.week}`).join(" ")}`.toLocaleLowerCase("fr").includes(needle);
    const matchesFilter = filter === "all"
      || (filter === "complete" && row.completion.validated === STAFF_DOCUMENT_TYPES.length)
      || (filter === "missing" && row.completion.missing > 0)
      || (filter === "pending" && row.completion.pending > 0);
    return matchesSearch && matchesFilter;
  }).sort((left, right) => memberName(left.member).localeCompare(memberName(right.member), "fr")), [members, contracts, documents, search, filter]);

  const totals = useMemo(() => members.reduce((summary, member) => {
    const completion = completionFor(member, documents);
    if (completion.validated === STAFF_DOCUMENT_TYPES.length) summary.complete += 1;
    if (completion.missing > 0) summary.missing += 1;
    if (completion.pending > 0) summary.pending += 1;
    return summary;
  }, { complete: 0, missing: 0, pending: 0 }), [members, documents]);

  const syncStatus = async (member, documentType, status, locked) => {
    const statusValue = { status, locked, updatedAt: new Date().toISOString() };
    await Promise.all([
      updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, member.id), { [`documentStatus.${documentType}`]: statusValue }),
      setDoc(doc(db, COLLECTIONS.STAFF_PUBLIC_PROFILES, member.id), {
        documentLocks: { [documentType]: locked },
        documentStatus: { [documentType]: statusValue },
        updatedAt: serverTimestamp(),
      }, { merge: true }),
    ]);
  };

  const changeStatus = async (member, document, status, locked) => {
    const key = `${document.id}-${status}`;
    setBusy(key);
    setMessage("");
    try {
      const updated = { ...document, status, locked, updatedAt: new Date().toISOString() };
      await updateDoc(doc(db, COLLECTIONS.STAFF_DOCUMENTS, document.id), {
        status,
        locked,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await syncStatus(member, document.documentType, status, locked);
      onDocumentChange(updated);
      setMessage(`${STAFF_DOCUMENT_TYPE_MAP_SAFE(document.documentType)} de ${memberName(member)} mis à jour.`);
    } catch (error) {
      setMessage(error?.message || "Mise à jour impossible.");
    } finally {
      setBusy("");
    }
  };

  const openDocument = async (document) => {
    const key = `${document.id}-open`;
    setBusy(key);
    setMessage("");
    try {
      const url = await getDownloadURL(ref(storage, document.storagePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error?.message || "Le fichier ne peut pas être ouvert.");
    } finally {
      setBusy("");
    }
  };

  const adminUpload = async (member, documentType, file) => {
    if (!file) return;
    const key = `${member.id}-${documentType}-upload`;
    setBusy(key);
    setMessage("");
    try {
      const created = await uploadStaffDocument({ member, documentType, file, source: "admin" });
      await syncStatus(member, documentType, "pending", false);
      onDocumentChange(created);
      setMessage(`${file.name} ajouté au dossier de ${memberName(member)}.`);
    } catch (error) {
      setMessage(error?.message || "Envoi impossible.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="hr-doc-manager">
      <div className="hr-doc-summary">
        <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}><strong>{members.length}</strong><span>Dossiers</span></button>
        <button type="button" className={filter === "complete" ? "is-active" : ""} onClick={() => setFilter("complete")}><strong>{totals.complete}</strong><span>Complets</span></button>
        <button type="button" className={filter === "pending" ? "is-active" : ""} onClick={() => setFilter("pending")}><strong>{totals.pending}</strong><span>À vérifier</span></button>
        <button type="button" className={filter === "missing" ? "is-active" : ""} onClick={() => setFilter("missing")}><strong>{totals.missing}</strong><span>Incomplets</span></button>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un animateur…" />
      </div>

      {message && <div className="hr-doc-message">{message}</div>}
      {!rows.length && <div className="hr-empty"><p>Aucun dossier ne correspond à ce filtre.</p></div>}

      <div className="hr-doc-members">
        {rows.map(({ member, assignments, completion }) => (
          <section key={member.id} className="hr-doc-member">
            <div className="hr-doc-member-head">
              <div>
                <h3>{memberName(member)}</h3>
                <p>{assignments.map((assignment) => [assignment.role, assignment.stayCode || assignment.stay, assignment.week].filter(Boolean).join(" · ")).join(" | ") || "Affectation à confirmer"}</p>
              </div>
              <span className={completion.validated === STAFF_DOCUMENT_TYPES.length ? "is-complete" : ""}>{completion.validated}/{STAFF_DOCUMENT_TYPES.length} validés</span>
            </div>
            <div className="hr-doc-type-grid">
              {STAFF_DOCUMENT_TYPES.map((type) => {
                const current = latestDocumentByType(documents, member.id, type.key);
                const status = statusOf(current);
                const uploadKey = `${member.id}-${type.key}-upload`;
                return (
                  <article key={type.key} className={`hr-doc-type-card is-${status.tone}`}>
                    <div className="hr-doc-type-title"><strong>{type.label}</strong><span>{status.label}{current?.locked ? " · verrouillé" : ""}</span></div>
                    {current ? (
                      <>
                        <button type="button" className="hr-doc-file" onClick={() => openDocument(current)} disabled={busy === `${current.id}-open`} title={current.originalName}>
                          <span>📄</span><span>{current.originalName}</span><em>{busy === `${current.id}-open` ? "Ouverture…" : "Ouvrir"}</em>
                        </button>
                        <div className="hr-doc-actions">
                          {current.status !== "validated" && <button type="button" className="is-validate" onClick={() => changeStatus(member, current, "validated", true)} disabled={Boolean(busy)}>Valider et verrouiller</button>}
                          {current.status === "validated" && <button type="button" onClick={() => changeStatus(member, current, "pending", false)} disabled={Boolean(busy)}>Rouvrir le dépôt</button>}
                          {current.status !== "rejected" && <button type="button" className="is-reject" onClick={() => changeStatus(member, current, "rejected", false)} disabled={Boolean(busy)}>À remplacer</button>}
                        </div>
                      </>
                    ) : <p className="hr-doc-missing">Aucun fichier reçu.</p>}
                    <label className="hr-doc-admin-upload">
                      <input type="file" accept={type.accept} onChange={(event) => { adminUpload(member, type.key, event.target.files?.[0]); event.target.value = ""; }} disabled={Boolean(busy)} />
                      <span>{busy === uploadKey ? "Envoi…" : current ? "Ajouter une nouvelle version" : "Importer depuis l’admin"}</span>
                    </label>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function STAFF_DOCUMENT_TYPE_MAP_SAFE(key) {
  return STAFF_DOCUMENT_TYPES.find((type) => type.key === key)?.label || "Document";
}
