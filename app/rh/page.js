"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import {
  STAFF_DOCUMENT_TYPES,
  uploadStaffDocument,
  validateStaffDocumentFile,
} from "@/src/lib/staffDocuments";
import styles from "./rh.module.css";

function displayName(profile) {
  return profile.name || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Membre de l’équipe";
}

function initials(profile) {
  return `${profile.firstName?.[0] || ""}${profile.lastName?.[0] || ""}`.toUpperCase() || displayName(profile).slice(0, 2).toUpperCase();
}

function assignmentLabel(assignment) {
  return [assignment.role, assignment.stayCode || assignment.stay, assignment.week].filter(Boolean).join(" · ");
}

export default function PublicRhPage() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    getDocs(query(collection(db, COLLECTIONS.STAFF_PUBLIC_PROFILES), orderBy("name")))
      .then((snapshot) => {
        if (!active) return;
        setProfiles(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })).filter((profile) => profile.active !== false));
      })
      .catch(() => active && setError("La liste de l’équipe est momentanément indisponible."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    if (!needle) return profiles;
    return profiles.filter((profile) => {
      const assignments = (profile.assignments || []).map(assignmentLabel).join(" ");
      return `${displayName(profile)} ${assignments}`.toLocaleLowerCase("fr").includes(needle);
    });
  }, [profiles, search]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>Équipe ColoCrew · Été 2026</div>
        <h1>Espace documents des équipes</h1>
        <p>Retrouvez votre nom puis déposez vos documents administratifs. Cet espace est un dépôt sécurisé : aucun fichier déjà transmis n’est consultable ici.</p>
      </section>

      <section className={styles.content}>
        <div className={styles.toolbar}>
          <div>
            <h2>Équipe affectée aux séjours</h2>
            <p>{profiles.length} membre{profiles.length > 1 ? "s" : ""} · cliquez sur votre nom pour déposer vos documents.</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un nom, un poste, une semaine…"
            aria-label="Rechercher dans l’équipe"
          />
        </div>

        {loading && <div className={styles.state}>Chargement de l’équipe…</div>}
        {error && <div className={`${styles.state} ${styles.error}`}>{error}</div>}
        {!loading && !error && !filtered.length && <div className={styles.state}>Aucun membre ne correspond à cette recherche.</div>}

        <div className={styles.grid}>
          {filtered.map((profile) => (
            <button key={profile.id} type="button" className={styles.card} onClick={() => setSelected(profile)}>
              <span className={styles.avatar}>{initials(profile)}</span>
              <span className={styles.identity}>
                <strong>{displayName(profile)}</strong>
                <span>{(profile.assignments || []).length ? (profile.assignments || []).map(assignmentLabel).join(" · ") : "Affectation à confirmer"}</span>
              </span>
              <span className={styles.arrow}>Déposer →</span>
            </button>
          ))}
        </div>
      </section>

      {selected && <UploadModal profile={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function UploadModal({ profile, onClose }) {
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState("");
  const [sent, setSent] = useState({});

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const isLocked = (type) => Boolean(profile.documentLocks?.[type] || profile.documentStatus?.[type]?.locked);
  const chooseFile = (type, file) => {
    const error = validateStaffDocumentFile(file);
    setFiles((previous) => ({ ...previous, [type]: error ? null : file }));
    setErrors((previous) => ({ ...previous, [type]: error }));
    setSent((previous) => ({ ...previous, [type]: false }));
  };
  const send = async (type) => {
    const file = files[type];
    const validationError = validateStaffDocumentFile(file);
    if (validationError) {
      setErrors((previous) => ({ ...previous, [type]: validationError }));
      return;
    }
    setSending(type);
    setErrors((previous) => ({ ...previous, [type]: "" }));
    try {
      await uploadStaffDocument({ member: profile, documentType: type, file, source: "public" });
      setFiles((previous) => ({ ...previous, [type]: null }));
      setSent((previous) => ({ ...previous, [type]: true }));
    } catch (uploadError) {
      setErrors((previous) => ({ ...previous, [type]: uploadError?.message || "Envoi impossible. Réessayez." }));
    } finally {
      setSending("");
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={`Documents de ${displayName(profile)}`}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">×</button>
        <div className={styles.modalHead}>
          <span className={styles.avatar}>{initials(profile)}</span>
          <div>
            <div className={styles.eyebrow}>Dossier administratif</div>
            <h2>{displayName(profile)}</h2>
            <p>{(profile.assignments || []).map(assignmentLabel).join(" · ") || "Affectation à confirmer"}</p>
          </div>
        </div>

        <div className={styles.privacy}>Les fichiers transmis ne sont jamais affichés sur cette page, ni pour vous ni pour les autres membres de l’équipe.</div>

        <div className={styles.uploadList}>
          {STAFF_DOCUMENT_TYPES.map((documentType) => {
            const locked = isLocked(documentType.key);
            return (
              <article key={documentType.key} className={`${styles.uploadCard} ${locked ? styles.locked : ""}`}>
                <div className={styles.uploadTitle}>
                  <span>{documentType.label}</span>
                  {locked && <strong>Validé · dépôt fermé</strong>}
                </div>
                {!locked && (
                  <>
                    <label className={styles.fileField}>
                      <input
                        type="file"
                        accept={documentType.accept}
                        onChange={(event) => chooseFile(documentType.key, event.target.files?.[0] || null)}
                        disabled={sending === documentType.key}
                      />
                      <span>{files[documentType.key]?.name || "Choisir un PDF, JPG ou PNG"}</span>
                    </label>
                    <button type="button" className={styles.send} onClick={() => send(documentType.key)} disabled={!files[documentType.key] || Boolean(sending)}>
                      {sending === documentType.key ? "Envoi…" : "Transmettre"}
                    </button>
                  </>
                )}
                {errors[documentType.key] && <p className={styles.fieldError}>{errors[documentType.key]}</p>}
                {sent[documentType.key] && <p className={styles.success}>Document transmis. Il sera vérifié par ColoCrew.</p>}
              </article>
            );
          })}
        </div>
        <p className={styles.footnote}>Taille maximale : 10 Mo par fichier. En cas de remplacement, transmettez simplement une nouvelle version tant que le document n’a pas été validé.</p>
      </section>
    </div>
  );
}
