"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { DASHBOARD_SECTIONS, effectiveDashboardSections } from "@/src/lib/dashboardAccess";
import { mapStaffAccount, staffAccountName } from "@/src/lib/staffAccounts";
import { useAuth } from "@/src/contexts/AuthContext";
import { dashboardFetch } from "@/src/lib/dashboardFetch";

const SECTION_DETAILS = {
  overview: "Vue transversale, incluant les réservations et les contrats.",
  transport: "Inclut les dossiers voyageurs et les données d’équipe nécessaires aux convoyages.",
  finance: "Inclut les données de réservation, de transport et de paie utilisées en comptabilité.",
  archives: "Inclut les dossiers de réservation, les convoyages, les contrats et les déroulés des saisons.",
  communication: "Inclut la liste des réservations pour sélectionner les familles.",
  dayPlans: "Inclut les données d’équipe utilisées pour planifier les séjours.",
  reservations: "Inclut les tarifs, les documents des familles et le journal de suivi.",
};

function displayName(account) {
  return account.name || staffAccountName(account);
}

function AccessForm({ account, onSaved }) {
  const { currentUser } = useAuth();
  const initial = effectiveDashboardSections(account);
  const [selection, setSelection] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const approved = account.status === "approved" && !!account.memberId;

  async function save(sections) {
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      await updateDoc(doc(db, COLLECTIONS.STAFF_ACCOUNTS, account.id), {
        dashboardSections: sections,
        dashboardReviewedAt: serverTimestamp(),
        dashboardReviewedBy: currentUser.uid,
      });
      onSaved(sections.length ? "Droits enregistrés." : "Accès au dashboard retiré.");
    } catch {
      setFailed(true);
      setMessage("Les droits n’ont pas pu être enregistrés. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dash-section dashboard-access-form">
      <h2>{displayName(account)}</h2>
      {account.email && <p className="dash-muted">{account.email}</p>}
      {account.administrator ? <p>Administrateur · Accès à toutes les sections</p> : !approved ? (
        <p>Validez et reliez le compte dans <Link href="/dashboard/rh/comptes">Comptes équipe</Link>.</p>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); save(selection); }}>
          <fieldset disabled={saving}>
            <legend>Sections autorisées</legend>
            <div className="dashboard-access-checkboxes">
              {DASHBOARD_SECTIONS.map(({ section, label }) => (
                <label key={section}>
                  <input type="checkbox" checked={selection.includes(section)} onChange={(event) =>
                    setSelection(event.target.checked ? [...selection, section] : selection.filter((value) => value !== section))
                  } />
                  <span><strong>{label}</strong>{SECTION_DETAILS[section] && <small>{SECTION_DETAILS[section]}</small>}</span>
                </label>
              ))}
            </div>
            <div className="dash-row-actions">
              <button type="submit" className="dash-btn dash-btn-primary">{saving ? "Enregistrement…" : "Enregistrer les droits"}</button>
              {initial.length > 0 && <button type="button" className="dash-btn" onClick={() => save([])}>Retirer tous les accès</button>}
            </div>
          </fieldset>
        </form>
      )}
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </div>
  );
}

export default function DashboardAccess() {
  const [accounts, setAccounts] = useState(null);
  const [administrators, setAdministrators] = useState(null);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [formVersion, setFormVersion] = useState(0);

  useEffect(() => {
    const failed = () => setError("Impossible de charger les comptes et leurs droits.");
    const stopAccounts = onSnapshot(collection(db, COLLECTIONS.STAFF_ACCOUNTS), (snapshot) =>
      setAccounts(snapshot.docs.map(mapStaffAccount)), failed);
    const directoryRequest = new AbortController();
    dashboardFetch("/api/dashboard/admins", { signal: directoryRequest.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Chargement des administrateurs impossible.");
        return response.json();
      })
      .then((list) => { if (!directoryRequest.signal.aborted) setAdministrators(list); })
      .catch(() => { if (!directoryRequest.signal.aborted) failed(); });
    return () => { stopAccounts(); directoryRequest.abort(); };
  }, []);

  const directory = useMemo(() => {
    if (!accounts || !administrators) return null;
    const team = new Map(accounts.map((entry) => [entry.id, entry]));
    const admins = administrators.map((admin) => {
      const staff = team.get(admin.id);
      team.delete(admin.id);
      return {
        ...staff,
        id: admin.id,
        name: admin.name || (staff ? staffAccountName(staff) : admin.email || "Administrateur"),
        email: admin.email || staff?.email || "",
        administrator: true,
      };
    });
    const staff = [...team.values()].map((account) => ({ ...account, administrator: false }));
    return [...admins, ...staff].sort((a, b) => displayName(a).localeCompare(displayName(b), "fr"));
  }, [accounts, administrators]);

  const searchText = search.trim().toLocaleLowerCase("fr");
  const visible = (directory || []).filter((account) =>
    (displayName(account) + " " + account.email).toLocaleLowerCase("fr").includes(searchText));
  const account = directory?.find((entry) => entry.id === selected);

  function accountButton(entry) {
    const count = effectiveDashboardSections(entry).length;
    const description = entry.administrator
      ? "Administrateur · Accès complet"
      : entry.status !== "approved"
        ? "Compte à valider"
        : count ? count + " section" + (count > 1 ? "s" : "") : "Aucun droit délégué";
    return (
      <button key={entry.id} type="button" aria-pressed={selected === entry.id} onClick={() => {
        setSelected(entry.id);
        setResult("");
      }}>
        <strong>{displayName(entry)}</strong>
        <span>{description}</span>
      </button>
    );
  }

  const visibleAdmins = visible.filter((entry) => entry.administrator);
  const visibleTeam = visible.filter((entry) => !entry.administrator);

  return (
    <div className="dash-page">
      <header className="dash-page-header">
        <h1>Droits d’accès</h1>
        <p>Consultez les administrateurs et gérez les accès de l’équipe.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {result && <p role="status">{result}</p>}
      <div className="dashboard-access-grid">
        <div className="dash-section dashboard-access-list">
          <label>Rechercher un compte
            <input className="dash-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {!directory && !error && <p>Chargement…</p>}
          {directory && !visible.length && <p>Aucun compte trouvé.</p>}
          {visibleAdmins.length > 0 && <>
            <h2 className="text-sm font-semibold">Administrateurs</h2>
            {visibleAdmins.map(accountButton)}
          </>}
          {visibleTeam.length > 0 && <>
            <h2 className="text-sm font-semibold">Comptes équipe</h2>
            {visibleTeam.map(accountButton)}
          </>}
        </div>
        {account && !error && (
          <AccessForm key={account.id + ":" + (account.dashboardReviewedAt?.toMillis?.() || 0) + ":" + formVersion}
            account={account}
            onSaved={(message) => { setResult(message); setFormVersion((version) => version + 1); }} />
        )}
      </div>
    </div>
  );
}
