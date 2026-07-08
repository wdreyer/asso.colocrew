"use client";

import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import {
  STAFF_DOCUMENT_STATUS,
  STAFF_DOCUMENT_TYPES,
  documentsByType,
  publicAssignmentsForMember,
  uploadStaffDocument,
} from "@/src/lib/staffDocuments";

function memberName(member) {
  return member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim();
}

function assignmentLabel(assignment) {
  return [assignment.role, assignment.stayCode || assignment.stay, assignment.week].filter(Boolean).join(" · ");
}

function assignmentMatches(assignments, stay, week) {
  if (stay === "all" && week === "all") return true;
  return assignments.some((assignment) => {
    const assignmentStay = assignment.stayCode || assignment.stay || "";
    return (stay === "all" || assignmentStay === stay) && (week === "all" || assignment.week === week);
  });
}

function statusForType(documents, memberId, typeKey) {
  const typeDocuments = documentsByType(documents, memberId, typeKey);
  const validated = typeDocuments.find((document) => document.status === "validated" && document.locked);
  if (validated) return { key: "validated", tone: "valid", label: "Validé", count: typeDocuments.length };
  if (typeDocuments.length) return { key: "pending", tone: "pending", label: "En cours", count: typeDocuments.length };
  return { key: "missing", tone: "missing", label: "Pas validé", count: 0 };
}

function completionFor(member, documents) {
  const statuses = STAFF_DOCUMENT_TYPES.map((type) => statusForType(documents, member.id, type.key));
  return {
    validated: statuses.filter((status) => status.key === "validated").length,
    pending: statuses.filter((status) => status.key === "pending").length,
    missing: statuses.filter((status) => status.key === "missing").length,
  };
}

function rowTone(completion) {
  if (completion.validated === STAFF_DOCUMENT_TYPES.length) return "valid";
  if (completion.pending > 0 || completion.validated > 0) return "partial";
  return "missing";
}

export default function StaffDocumentsPanel({ members, contracts, documents, onDocumentChange, onDocumentDelete }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [stayFilter, setStayFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const stayOptions = useMemo(() => [...new Set(contracts.map((contract) => contract.stayCode || contract.stay).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr")), [contracts]);
  const weekOptions = useMemo(() => [...new Set(contracts.map((contract) => contract.week).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr")), [contracts]);

  const rows = useMemo(() => members.map((member) => ({
    member,
    assignments: publicAssignmentsForMember(member.id, contracts),
    completion: completionFor(member, documents),
  })).filter((row) => {
    const needle = search.trim().toLocaleLowerCase("fr");
    const haystack = `${memberName(row.member)} ${row.assignments.map((assignment) => `${assignment.role} ${assignment.stay} ${assignment.week}`).join(" ")}`;
    const matchesSearch = !needle || haystack.toLocaleLowerCase("fr").includes(needle);
    const matchesFilter = filter === "all"
      || (filter === "complete" && row.completion.validated === STAFF_DOCUMENT_TYPES.length)
      || (filter === "missing" && row.completion.missing > 0)
      || (filter === "pending" && row.completion.pending > 0);
    return matchesSearch && matchesFilter && assignmentMatches(row.assignments, stayFilter, weekFilter);
  }).sort((left, right) => memberName(left.member).localeCompare(memberName(right.member), "fr")), [members, contracts, documents, search, filter, stayFilter, weekFilter]);

  const totals = useMemo(() => members.reduce((summary, member) => {
    const completion = completionFor(member, documents);
    if (completion.validated === STAFF_DOCUMENT_TYPES.length) summary.complete += 1;
    if (completion.pending > 0) summary.pending += 1;
    if (completion.missing > 0) summary.missing += 1;
    return summary;
  }, { complete: 0, missing: 0, pending: 0 }), [members, documents]);

  const selectedRow = useMemo(() => rows.find((row) => row.member.id === selectedMemberId) || null, [rows, selectedMemberId]);

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

  const changeStatus = async (member, documentItem, status, locked) => {
    setBusy(`${documentItem.id}-${status}`);
    setMessage("");
    try {
      const updated = { ...documentItem, status, locked, updatedAt: new Date().toISOString() };
      await updateDoc(doc(db, COLLECTIONS.STAFF_DOCUMENTS, documentItem.id), {
        status,
        locked,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const siblingDocuments = documentsByType(documents, member.id, documentItem.documentType)
        .filter((item) => item.id !== documentItem.id)
        .concat(updated);
      const categoryValidated = siblingDocuments.some((item) => item.status === "validated" && item.locked);
      await syncStatus(member, documentItem.documentType, categoryValidated ? "validated" : status, categoryValidated);
      onDocumentChange(updated);
      setMessage(`${documentTypeLabel(documentItem.documentType)} de ${memberName(member)} mis à jour.`);
    } catch (error) {
      setMessage(error?.message || "Mise à jour impossible.");
    } finally {
      setBusy("");
    }
  };

  const openDocument = async (documentItem) => {
    setBusy(`${documentItem.id}-open`);
    setMessage("");
    try {
      const url = await getDownloadURL(ref(storage, documentItem.storagePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error?.message || "Le fichier ne peut pas être ouvert.");
    } finally {
      setBusy("");
    }
  };

  const adminUpload = async (member, documentType, selectedFiles) => {
    const files = Array.from(selectedFiles || []);
    if (!files.length) return;
    setBusy(`${member.id}-${documentType}-upload`);
    setMessage("");
    try {
      const createdDocuments = [];
      for (const file of files) {
        createdDocuments.push(await uploadStaffDocument({ member, documentType, file, source: "admin" }));
      }
      const categoryAlreadyValidated = documentsByType(documents, member.id, documentType)
        .some((documentItem) => documentItem.status === "validated" && documentItem.locked);
      await syncStatus(member, documentType, categoryAlreadyValidated ? "validated" : "pending", categoryAlreadyValidated);
      createdDocuments.forEach(onDocumentChange);
      setMessage(`${files.length} fichier${files.length > 1 ? "s" : ""} ajouté${files.length > 1 ? "s" : ""} au dossier de ${memberName(member)}.`);
    } catch (error) {
      setMessage(error?.message || "Envoi impossible.");
    } finally {
      setBusy("");
    }
  };

  const validateWithoutFile = async (member, documentType) => {
    setBusy(`${member.id}-${documentType}-manual`);
    setMessage("");
    try {
      const entry = {
        memberId: member.id,
        memberName: memberName(member),
        documentType,
        originalName: "Validation administrative sans fichier",
        storagePath: "",
        contentType: "",
        size: 0,
        status: "validated",
        locked: true,
        source: "admin-manual",
        virtual: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        reviewedAt: serverTimestamp(),
      };
      const created = await addDoc(collection(db, COLLECTIONS.STAFF_DOCUMENTS), entry);
      await syncStatus(member, documentType, "validated", true);
      onDocumentChange({ id: created.id, ...entry, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setMessage(`${documentTypeLabel(documentType)} de ${memberName(member)} validé sans fichier.`);
    } catch (error) {
      setMessage(error?.message || "Validation impossible.");
    } finally {
      setBusy("");
    }
  };

  const deleteStaffDocument = async (member, documentItem) => {
    const label = documentItem.originalName || "ce document";
    if (!window.confirm(`Supprimer définitivement « ${label} » du dossier de ${memberName(member)} ?`)) return;
    setBusy(`${documentItem.id}-delete`);
    setMessage("");
    try {
      if (documentItem.storagePath) {
        try {
          await deleteObject(ref(storage, documentItem.storagePath));
        } catch (storageError) {
          if (storageError?.code !== "storage/object-not-found") throw storageError;
        }
      }
      await deleteDoc(doc(db, COLLECTIONS.STAFF_DOCUMENTS, documentItem.id));

      const remaining = documentsByType(documents, member.id, documentItem.documentType)
        .filter((item) => item.id !== documentItem.id);
      const validated = remaining.some((item) => item.status === "validated" && item.locked);
      const fallbackStatus = validated
        ? "validated"
        : remaining.find((item) => item.status !== "validated")?.status || "missing";
      await syncStatus(member, documentItem.documentType, fallbackStatus, validated);
      onDocumentDelete(documentItem.id);
      setMessage(`${documentTypeLabel(documentItem.documentType)} supprimé du dossier de ${memberName(member)}.`);
    } catch (error) {
      setMessage(error?.message || "Suppression impossible.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="hr-doc-manager">
      <div className="hr-doc-summary">
        <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}><strong>{members.length}</strong><span>Dossiers</span></button>
        <button type="button" className={filter === "complete" ? "is-active" : ""} onClick={() => setFilter("complete")}><strong>{totals.complete}</strong><span>Complets</span></button>
        <button type="button" className={filter === "pending" ? "is-active" : ""} onClick={() => setFilter("pending")}><strong>{totals.pending}</strong><span>En cours</span></button>
        <button type="button" className={filter === "missing" ? "is-active" : ""} onClick={() => setFilter("missing")}><strong>{totals.missing}</strong><span>Pas validés</span></button>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un animateur…" />
      </div>

      <div className="hr-doc-card-filters">
        <div className="hr-doc-filter-group">
          <span>Séjour</span>
          <div className="hr-doc-filter-options">
            <button type="button" className={`hr-doc-filter-card ${stayFilter === "all" ? "is-active" : ""}`} onClick={() => setStayFilter("all")}>Tous</button>
            {stayOptions.map((stay) => (
              <button type="button" key={stay} className={`hr-doc-filter-card ${stayFilter === stay ? "is-active" : ""}`} onClick={() => setStayFilter(stay)}>{stay}</button>
            ))}
          </div>
        </div>
        <div className="hr-doc-filter-group">
          <span>Semaine</span>
          <div className="hr-doc-filter-options">
            <button type="button" className={`hr-doc-filter-card ${weekFilter === "all" ? "is-active" : ""}`} onClick={() => setWeekFilter("all")}>Toutes</button>
            {weekOptions.map((week) => (
              <button type="button" key={week} className={`hr-doc-filter-card ${weekFilter === week ? "is-active" : ""}`} onClick={() => setWeekFilter(week)}>{week}</button>
            ))}
          </div>
        </div>
      </div>

      {message && <div className="hr-doc-message">{message}</div>}
      {!rows.length && <div className="hr-empty"><p>Aucun dossier ne correspond à ce filtre.</p></div>}

      {!!rows.length && (
        <div className="hr-doc-table-wrap">
          <table className="hr-doc-table is-simple">
            <thead>
              <tr>
                <th>Animateur</th>
                <th>Affectations</th>
                {STAFF_DOCUMENT_TYPES.map((type) => <th key={type.key}>{type.label}</th>)}
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ member, assignments, completion }) => {
                const tone = rowTone(completion);
                return (
                  <tr
                    key={member.id}
                    className={`is-${tone} ${selectedMemberId === member.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <td className="hr-doc-person-cell"><strong>{memberName(member)}</strong></td>
                    <td className="hr-doc-assignments-cell">{assignments.map(assignmentLabel).join(" | ") || "Affectation à confirmer"}</td>
                    {STAFF_DOCUMENT_TYPES.map((type) => {
                      const status = statusForType(documents, member.id, type.key);
                      return (
                        <td key={type.key}>
                          <span className={`hr-doc-status is-${status.tone}`}>
                            {status.label}{status.count > 1 ? ` · ${status.count}` : ""}
                          </span>
                        </td>
                      );
                    })}
                    <td><span className={`hr-doc-global is-${tone}`}>{completion.validated}/{STAFF_DOCUMENT_TYPES.length}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedRow && (
        <section className="hr-doc-detail-panel">
          <div className="hr-doc-detail-head">
            <div>
              <h3>{memberName(selectedRow.member)}</h3>
              <p>{selectedRow.assignments.map(assignmentLabel).join(" | ") || "Affectation à confirmer"}</p>
            </div>
            <button type="button" onClick={() => setSelectedMemberId("")}>Fermer</button>
          </div>
          <div className="hr-doc-detail-grid">
            {STAFF_DOCUMENT_TYPES.map((type) => (
              <DocumentTypePanel
                key={type.key}
                type={type}
                member={selectedRow.member}
                documents={documentsByType(documents, selectedRow.member.id, type.key)}
                busy={busy}
                onOpen={openDocument}
                onUpload={adminUpload}
                onValidate={changeStatus}
                onManualValidate={validateWithoutFile}
                onDelete={deleteStaffDocument}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DocumentTypePanel({ type, member, documents, busy, onOpen, onUpload, onValidate, onManualValidate, onDelete }) {
  const validatedDocument = documents.find((documentItem) => documentItem.status === "validated" && documentItem.locked);
  const current = validatedDocument || documents[0] || null;
  const status = statusForType(documents, member.id, type.key);
  const uploadKey = `${member.id}-${type.key}-upload`;

  return (
    <article className={`hr-doc-detail-card is-${status.tone}`}>
      <div className="hr-doc-detail-card-head">
        <strong>{type.label}</strong>
        <span className={`hr-doc-status is-${status.tone}`}>{status.label}</span>
      </div>
      {documents.length ? (
        <div className="hr-doc-detail-files">
          {documents.map((documentItem) => (
            <div key={documentItem.id} className="hr-doc-detail-file">
              {documentItem.storagePath ? (
                <button type="button" className="hr-doc-file" onClick={() => onOpen(documentItem)} disabled={busy === `${documentItem.id}-open`} title={documentItem.originalName}>
                  <span>Doc</span><span>{documentItem.originalName}</span><em>{busy === `${documentItem.id}-open` ? "Ouverture..." : "Ouvrir"}</em>
                </button>
              ) : <div className="hr-doc-manual">Validation administrative sans fichier</div>}
              <div className="hr-doc-actions">
                {documentItem.status !== "validated" && <button type="button" className="is-validate" onClick={() => onValidate(member, documentItem, "validated", true)} disabled={Boolean(busy)}>Valider</button>}
                {documentItem.status === "validated" && <button type="button" onClick={() => onValidate(member, documentItem, "pending", false)} disabled={Boolean(busy)}>Rouvrir</button>}
                {documentItem.status !== "rejected" && !documentItem.virtual && <button type="button" className="is-reject" onClick={() => onValidate(member, documentItem, "rejected", false)} disabled={Boolean(busy)}>À remplacer</button>}
                <button type="button" className="is-delete" onClick={() => onDelete(member, documentItem)} disabled={Boolean(busy)}>
                  {busy === `${documentItem.id}-delete` ? "Suppression..." : "Supprimer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="hr-doc-missing">Aucun fichier reçu.</p>}
      <div className="hr-doc-detail-actions">
        <label className="hr-doc-admin-upload">
          <input type="file" multiple accept={type.accept} onChange={(event) => { onUpload(member, type.key, event.target.files); event.target.value = ""; }} disabled={Boolean(busy)} />
          <span>{busy === uploadKey ? "Envoi..." : current ? "Ajouter un fichier" : "Importer un fichier"}</span>
        </label>
        {!validatedDocument && <button type="button" className="hr-doc-manual-validate" onClick={() => onManualValidate(member, type.key)} disabled={Boolean(busy)}>Valider sans fichier</button>}
      </div>
    </article>
  );
}

function documentTypeLabel(key) {
  return STAFF_DOCUMENT_TYPES.find((type) => type.key === key)?.label || "Document";
}
