"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useToast } from "@/src/contexts/ToastContext";
import { CAMPAIGN_TEMPLATES } from "@/src/lib/campaignTemplates";

// Expediteurs verifies @colocrew.com.

const SENDERS = [
  { name: "Equipe ColoCrew",       email: "equipe@colocrew.com" },
  { name: "ColoCrew Inscriptions", email: "inscriptions@colocrew.com" },
  { name: "William Dreyer",        email: "w.dreyer@colocrew.com" },
  { name: "ColoCrew Partenaires",  email: "partenaires@colocrew.com" },
];

const TABS = [
  { key: "contacts",  label: "Contacts" },
  { key: "campagne",  label: "Nouvelle campagne" },
  { key: "historique", label: "Historique" },
];

// Modèles proposés dans « Nouvelle campagne » (mails sobres, voir src/lib/campaignTemplates.js).
const TEMPLATES = CAMPAIGN_TEMPLATES;

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h =>
    h.trim().toLowerCase().replace(/["']/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  );
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
  });
  return { headers, rows: rows.filter(r => r.email || r["e-mail"]) };
}

function rowsToContacts(rows) {
  return rows.map(r => ({
    email:  (r.email || r["e-mail"] || "").toLowerCase().trim(),
    prenom: r.prenom || r.firstname || "",
    nom:    r.nom    || r.lastname  || r.name || "",
  })).filter(c => c.email.includes("@") && c.email.includes("."));
}

// ── Styles ───────────────────────────────────────────────────────────────────

const S = {
  input: {
    border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
    fontSize: 14, background: "#fff", outline: "none", minWidth: 200, color: "#1e293b",
  },
  inputFull: {
    border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
    fontSize: 14, background: "#fff", outline: "none", width: "100%", color: "#1e293b",
  },
  label: { fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px" },
};

// ── UI atoms ─────────────────────────────────────────────────────────────────

function Btn({ children, onClick, type = "button", variant = "primary", size = "md", disabled, loading, style }) {
  const base = { border: "none", borderRadius: 8, fontWeight: 600, cursor: (disabled || loading) ? "not-allowed" : "pointer", opacity: (disabled || loading) ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const sizes = { sm: { padding: "6px 14px", fontSize: 13 }, md: { padding: "9px 20px", fontSize: 14 }, lg: { padding: "12px 28px", fontSize: 15 } };
  const variants = {
    primary: { background: "#7c3aed", color: "#fff" },
    danger:  { background: "#ef4444", color: "#fff" },
    ghost:   { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" },
    success: { background: "#10b981", color: "#fff" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {loading && <span style={{ width: 13, height: 13, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />}
      {children}
    </button>
  );
}

function H2({ children, mt = 8 }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 16, marginTop: mt }}>{children}</h2>;
}

// ── Tab: Contacts ────────────────────────────────────────────────────────────

function TabContacts({ lists, setLists }) {
  const { showToast } = useToast();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [csvData, setCsvData] = useState(null);
  const [targetList, setTargetList] = useState("");
  const [importing, setImporting] = useState(false);
  const [openList, setOpenList] = useState(null);
  const [listContacts, setListContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvData(parseCsv(ev.target.result));
    reader.readAsText(file, "UTF-8");
  }

  async function loadLists() {
    const r = await fetch("/api/brevo/lists").then(r => r.json());
    setLists(r.lists || []);
  }

  async function createList() {
    if (!newName.trim()) return;
    setSaving(true);
    const r = await fetch("/api/brevo/lists", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    }).then(r => r.json());
    if (r.id) { showToast("Liste créée", "success"); setNewName(""); loadLists(); }
    else showToast(r.error || "Erreur", "error");
    setSaving(false);
  }

  async function deleteList(id) {
    if (!window.confirm("Supprimer cette liste et tous ses contacts ?")) return;
    await fetch("/api/brevo/contacts", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: id }),
    });
    await fetch("/api/brevo/lists", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    showToast("Liste supprimée", "success");
    loadLists();
  }

  async function importContacts() {
    if (!csvData || !targetList) return showToast("Sélectionnez une liste cible", "error");
    const contacts = rowsToContacts(csvData.rows);
    if (!contacts.length) return showToast("Aucun email valide trouvé", "error");
    setImporting(true);
    const r = await fetch("/api/brevo/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, listId: targetList }),
    }).then(r => r.json());
    if (r.added !== undefined) {
      showToast(`${r.added} contacts importés`, "success");
      setCsvData(null);
      if (fileRef.current) fileRef.current.value = "";
      loadLists();
    } else showToast(r.error || "Erreur import", "error");
    setImporting(false);
  }

  async function viewContacts(listId) {
    if (openList === listId) { setOpenList(null); return; }
    setOpenList(listId);
    setLoadingContacts(true);
    const r = await fetch(`/api/brevo/contacts?listId=${listId}`).then(r => r.json());
    setListContacts(r.contacts || []);
    setLoadingContacts(false);
  }

  return (
    <>
      <H2>Créer une liste</H2>
      <div style={{ display: "flex", gap: 10, marginBottom: 32, alignItems: "flex-end" }}>
        <input style={{ ...S.inputFull, maxWidth: 380 }} placeholder="Nom de la liste (ex: Prospects été 2025)"
          value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && createList()} />
        <Btn onClick={createList} loading={saving}>Créer</Btn>
      </div>

      <H2>Importer un CSV</H2>
      <div style={{ background: "#f8fafc", border: "2px dashed #cbd5e1", borderRadius: 10, padding: "22px", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
          Format — 1ère ligne = en-têtes : <code>email,prenom,nom</code>
        </p>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ fontSize: 13, cursor: "pointer" }} />
      </div>

      {csvData && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: "#059669", fontWeight: 600, marginBottom: 10 }}>
            ✓ {csvData.rows.length} lignes — colonnes : {csvData.headers.join(", ")}
          </div>
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 300 }}>
              <thead><tr>{csvData.headers.map(h => <th key={h} style={{ background: "#f1f5f9", padding: "6px 14px", border: "1px solid #e2e8f0", textAlign: "left", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {csvData.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{csvData.headers.map(h => <td key={h} style={{ padding: "6px 14px", border: "1px solid #f1f5f9" }}>{r[h]}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {csvData.rows.length > 5 && <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>+ {csvData.rows.length - 5} autres…</p>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select style={S.input} value={targetList} onChange={e => setTargetList(e.target.value)}>
              <option value="">Liste cible…</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count} contacts)</option>)}
            </select>
            <Btn onClick={importContacts} loading={importing}>Importer {csvData.rows.length} contacts</Btn>
            <Btn variant="ghost" onClick={() => { setCsvData(null); if (fileRef.current) fileRef.current.value = ""; }}>Annuler</Btn>
          </div>
        </div>
      )}

      <H2 mt={32}>Mes listes ({lists.length})</H2>
      {!lists.length ? (
        <p style={{ color: "#94a3b8", fontSize: 14 }}>Aucune liste créée.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lists.map(l => (
            <div key={l.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</span>
                  <span style={{ fontSize: 12, color: "#64748b", marginLeft: 10 }}>{l.count} contact(s)</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="ghost" size="sm" onClick={() => viewContacts(l.id)}>
                    {openList === l.id ? "Masquer" : "Voir"}
                  </Btn>
                  <Btn variant="danger" size="sm" onClick={() => deleteList(l.id)}>Supprimer</Btn>
                </div>
              </div>
              {openList === l.id && (
                <div style={{ padding: "12px 18px", background: "#fafafa", border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                  {loadingContacts ? (
                    <p style={{ fontSize: 13, color: "#94a3b8" }}>Chargement…</p>
                  ) : !listContacts.length ? (
                    <p style={{ fontSize: 13, color: "#94a3b8" }}>Aucun contact dans cette liste.</p>
                  ) : (
                    <>
                      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{listContacts.length} contacts :</p>
                      <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
                        {listContacts.map((c, i) => (
                          <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
                            <strong>{c.prenom} {c.nom}</strong> — {c.email}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Tab: Nouvelle campagne ────────────────────────────────────────────────────

const SPEED_OPTIONS = [
  { label: "Lent — 10s entre chaque (très sûr)",      value: 10000 },
  { label: "Normal — 3s entre chaque (recommandé)",   value: 3000  },
  { label: "Rapide — 1s entre chaque (petites listes)", value: 1000  },
];

const EMPTY_EMAIL_DOCUMENT = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";

function EmailWysiwygEditor({ value, onChange }) {
  const iframeRef = useRef(null);
  const cleanupRef = useRef(() => {});
  const onChangeRef = useRef(onChange);
  const loadedValueRef = useRef("");
  const lastEmittedValueRef = useRef("");
  const savedRangeRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const serializeDocument = useCallback((doc) => {
    const root = doc.documentElement.cloneNode(true);
    root.querySelectorAll("[data-email-editor-only]").forEach((node) => node.remove());
    const body = root.querySelector("body");
    body?.removeAttribute("contenteditable");
    body?.removeAttribute("spellcheck");
    return `<!DOCTYPE html>\n${root.outerHTML}`;
  }, []);

  const loadDocument = useCallback((nextValue) => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    cleanupRef.current();
    doc.open();
    doc.write(nextValue || "<p>Commencez à écrire votre email…</p>");
    doc.close();

    const body = doc.body;
    if (!body) return;

    body.contentEditable = "true";
    body.spellcheck = true;

    const editorStyle = doc.createElement("style");
    editorStyle.setAttribute("data-email-editor-only", "true");
    editorStyle.textContent = `
      html { background: #f8fafc; }
      body { min-height: 400px; outline: none; cursor: text; }
      body:focus { outline: none; }
      a { cursor: text; }
    `;
    doc.head.appendChild(editorStyle);

    const saveSelection = () => {
      const selection = iframe.contentWindow?.getSelection();
      if (selection?.rangeCount) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    };

    const emitChange = () => {
      const nextHtml = serializeDocument(doc);
      lastEmittedValueRef.current = nextHtml;
      onChangeRef.current(nextHtml);
    };

    body.addEventListener("input", emitChange);
    body.addEventListener("keyup", saveSelection);
    body.addEventListener("mouseup", saveSelection);
    doc.addEventListener("selectionchange", saveSelection);
    cleanupRef.current = () => {
      body.removeEventListener("input", emitChange);
      body.removeEventListener("keyup", saveSelection);
      body.removeEventListener("mouseup", saveSelection);
      doc.removeEventListener("selectionchange", saveSelection);
    };
    loadedValueRef.current = nextValue;
    lastEmittedValueRef.current = nextValue;
  }, [serializeDocument]);

  useEffect(() => {
    if (value === lastEmittedValueRef.current || value === loadedValueRef.current) return;
    loadDocument(value);
  }, [loadDocument, value]);

  useEffect(() => () => cleanupRef.current(), []);

  function restoreSelection() {
    const iframe = iframeRef.current;
    const selection = iframe?.contentWindow?.getSelection();
    if (!selection || !savedRangeRef.current) return;
    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
  }

  function runCommand(command, commandValue = null) {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;
    iframe.contentWindow?.focus();
    restoreSelection();
    doc.execCommand(command, false, commandValue);
    const nextHtml = serializeDocument(doc);
    lastEmittedValueRef.current = nextHtml;
    onChangeRef.current(nextHtml);
  }

  function addLink() {
    const rawUrl = window.prompt("Adresse du lien :", "https://");
    if (!rawUrl) return;
    const url = /^(https?:|mailto:|tel:)/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    runCommand("createLink", url);
  }

  const toolButtonStyle = {
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #d7dde5",
    borderRadius: 6,
    background: "#fff",
    color: "#24303f",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  };

  const commandButton = (label, title, command, commandValue = null, extraStyle = {}) => (
    <button
      key={title}
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => runCommand(command, commandValue)}
      style={{ ...toolButtonStyle, ...extraStyle }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: 8, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
        <select
          aria-label="Style du texte"
          title="Style du texte"
          defaultValue="p"
          onChange={(event) => runCommand("formatBlock", event.target.value)}
          style={{ height: 34, minWidth: 112, border: "1px solid #d7dde5", borderRadius: 6, background: "#fff", padding: "0 8px", color: "#24303f" }}
        >
          <option value="p">Paragraphe</option>
          <option value="h1">Titre 1</option>
          <option value="h2">Titre 2</option>
          <option value="h3">Titre 3</option>
        </select>
        <select
          aria-label="Police"
          title="Police"
          defaultValue="Arial"
          onChange={(event) => runCommand("fontName", event.target.value)}
          style={{ height: 34, minWidth: 100, border: "1px solid #d7dde5", borderRadius: 6, background: "#fff", padding: "0 8px", color: "#24303f" }}
        >
          <option value="Arial">Arial</option>
          <option value="Verdana">Verdana</option>
          <option value="Georgia">Georgia</option>
          <option value="Trebuchet MS">Trebuchet</option>
        </select>
        <select
          aria-label="Taille du texte"
          title="Taille du texte"
          defaultValue="3"
          onChange={(event) => runCommand("fontSize", event.target.value)}
          style={{ height: 34, width: 74, border: "1px solid #d7dde5", borderRadius: 6, background: "#fff", padding: "0 8px", color: "#24303f" }}
        >
          <option value="2">Petit</option>
          <option value="3">Normal</option>
          <option value="4">Grand</option>
          <option value="5">Très grand</option>
        </select>
        <span style={{ width: 1, height: 24, background: "#d7dde5", margin: "0 2px" }} />
        {commandButton("B", "Gras", "bold")}
        {commandButton("I", "Italique", "italic", null, { fontFamily: "Georgia, serif", fontStyle: "italic" })}
        {commandButton("U", "Souligné", "underline", null, { textDecoration: "underline" })}
        <label title="Couleur du texte" aria-label="Couleur du texte" style={{ ...toolButtonStyle, position: "relative" }}>
          <span style={{ borderBottom: "3px solid #8f1d2c", lineHeight: 1 }}>A</span>
          <input
            type="color"
            defaultValue="#8f1d2c"
            onChange={(event) => runCommand("foreColor", event.target.value)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
          />
        </label>
        <span style={{ width: 1, height: 24, background: "#d7dde5", margin: "0 2px" }} />
        {commandButton("•", "Liste à puces", "insertUnorderedList", null, { fontSize: 21 })}
        {commandButton("1.", "Liste numérotée", "insertOrderedList")}
        {commandButton("≡", "Aligner à gauche", "justifyLeft", null, { fontSize: 18 })}
        {commandButton("≡", "Centrer", "justifyCenter", null, { fontSize: 18, textAlign: "center" })}
        {commandButton("≡", "Aligner à droite", "justifyRight", null, { fontSize: 18, textAlign: "right" })}
        <span style={{ width: 1, height: 24, background: "#d7dde5", margin: "0 2px" }} />
        <button type="button" title="Ajouter un lien" aria-label="Ajouter un lien" onMouseDown={(event) => event.preventDefault()} onClick={addLink} style={toolButtonStyle}>↗</button>
        {commandButton("×", "Retirer le lien", "unlink", null, { fontSize: 18 })}
        {commandButton("Tx", "Effacer la mise en forme", "removeFormat", null, { fontSize: 12 })}
        {commandButton("↶", "Annuler", "undo", null, { fontSize: 18 })}
        {commandButton("↷", "Rétablir", "redo", null, { fontSize: 18 })}
        <span style={{ width: 1, height: 24, background: "#d7dde5", margin: "0 2px" }} />
        <button type="button" title="Insérer le prénom" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertText", "{{params.PRENOM}}")}
          style={{ ...toolButtonStyle, width: "auto", padding: "0 9px", fontSize: 11 }}>Prénom</button>
        <button type="button" title="Insérer le nom" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertText", "{{params.NOM}}")}
          style={{ ...toolButtonStyle, width: "auto", padding: "0 9px", fontSize: 11 }}>Nom</button>
      </div>
      <iframe
        ref={iframeRef}
        title="Éditeur visuel de l'email"
        srcDoc={EMPTY_EMAIL_DOCUMENT}
        onLoad={() => {
          if (initializedRef.current) return;
          initializedRef.current = true;
          loadDocument(value);
        }}
        sandbox="allow-same-origin"
        style={{ display: "block", width: "100%", height: 480, border: 0, background: "#fff" }}
      />
    </div>
  );
}

async function consumeNdjson(response, onMessage) {
  if (!response.ok || !response.body) {
    const raw = await response.text().catch(() => "");
    let message = raw;
    try { message = JSON.parse(raw).error || raw; } catch { /* plain-text response */ }
    throw new Error(message || `Erreur HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onMessage(JSON.parse(line));
    }
    if (done) break;
  }

  if (buffer.trim()) onMessage(JSON.parse(buffer));
}

function TabCampagne({ lists }) {
  const { showToast } = useToast();

  // Formulaire
  const [activeTemplateKey, setActiveTemplateKey] = useState(TEMPLATES[0].key);
  const [subject,     setSubject]     = useState(TEMPLATES[0].subject);
  const [html,        setHtml]        = useState(TEMPLATES[0].html);
  const [replyTo,     setReplyTo]     = useState("equipe@colocrew.com");
  const [editorMode,  setEditorMode]  = useState("visual");
  const [delayMs,     setDelayMs]     = useState(3000);
  const [drafts,      setDrafts]      = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [draftName,   setDraftName]   = useState(TEMPLATES[0].label);
  const [savingDraft, setSavingDraft] = useState(false);

  // Source contacts
  const [sourceMode,  setSourceMode]  = useState("list"); // "list" | "csv"
  const [listId,      setListId]      = useState("");
  const [csvContacts, setCsvContacts] = useState(null);
  const fileRef = useRef();

  // Senders rotation
  const [selectedSenders, setSelectedSenders] = useState(SENDERS.map((_, i) => i));

  // Test
  const [testEmail,   setTestEmail]   = useState("");
  const [testSender,  setTestSender]  = useState(0);
  const [testing,     setTesting]     = useState(false);

  // Dispatch state
  const [dispatching,  setDispatching]  = useState(false);
  const [progress,     setProgress]     = useState(null);
  const [dispatchDone, setDispatchDone] = useState(null);
  const [activeRunId,  setActiveRunId]  = useState(null);
  const [savedRun,     setSavedRun]     = useState(null);
  const [savedEvents,  setSavedEvents]  = useState([]);
  const [controllingRun, setControllingRun] = useState(false);

  const selectedList = useMemo(
    () => lists.find((list) => list.id === listId) || null,
    [lists, listId],
  );

  const loadRun = useCallback(async (runId) => {
    if (!runId) return;
    const r = await fetch(`/api/brevo/runs/${runId}`).then(r => r.json());
    if (r.run) {
      setSavedRun(r.run);
      setSavedEvents(r.events || []);
    }
  }, []);

  const loadLatestRun = useCallback(async () => {
    const r = await fetch("/api/brevo/runs?limit=1").then(r => r.json());
    const latest = r.runs?.[0];
    if (latest) {
      setActiveRunId(latest.id);
      setSavedRun(latest);
      await loadRun(latest.id);
    }
  }, [loadRun]);

  const loadDrafts = useCallback(async () => {
    try {
      const response = await fetch("/api/brevo/drafts");
      const data = await response.json();
      if (response.ok) setDrafts(data.drafts || []);
    } catch {
      // Draft loading must not prevent campaign editing.
    }
  }, []);

  useEffect(() => { loadLatestRun(); }, [loadLatestRun]);
  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  useEffect(() => {
    if (!activeRunId) return;
    const timer = setInterval(() => loadRun(activeRunId), 3000);
    return () => clearInterval(timer);
  }, [activeRunId, loadRun]);

  async function controlRun(runId, action, values = {}) {
    if (!runId) return;
    setControllingRun(true);
    try {
      const r = await fetch(`/api/brevo/runs/${runId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      }).then(r => r.json());
      if (r.ok && action === "speed") setDelayMs(r.delayMs);
      const successMessage = action === "speed" ? "Vitesse modifiée" : `Demande ${action} envoyée`;
      showToast(r.ok ? successMessage : (r.error || "Erreur"), r.ok ? "success" : "error");
      await loadRun(runId);
    } catch {
      showToast("Impossible d'envoyer la demande", "error");
    }
    setControllingRun(false);
  }

  function pickTemplate(key) {
    const t = TEMPLATES.find(t => t.key === key);
    if (t) {
      setActiveTemplateKey(t.key);
      setActiveDraftId(null);
      setDraftName(t.label);
      setSubject(t.subject);
      setHtml(t.html);
      setEditorMode("visual");
    }
  }

  function pickDraft(draft) {
    setActiveTemplateKey("");
    setActiveDraftId(draft.id);
    setDraftName(draft.name || draft.subject || "Brouillon");
    setSubject(draft.subject || "");
    setHtml(draft.html || "");
    setReplyTo(draft.replyTo || "equipe@colocrew.com");
    setEditorMode("visual");
  }

  async function saveDraft() {
    if (!subject.trim() || !html.trim() || !replyTo.trim()) {
      return showToast("Objet, contenu et adresse de reponse requis", "error");
    }

    setSavingDraft(true);
    try {
      const response = await fetch("/api/brevo/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeDraftId,
          name: draftName.trim() || subject.trim(),
          subject,
          html,
          replyTo,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Impossible d'enregistrer le brouillon");
      setActiveDraftId(data.id);
      setActiveTemplateKey("");
      setDraftName(draftName.trim() || subject.trim());
      await loadDrafts();
      showToast("Mail enregistre", "success");
    } catch (error) {
      showToast(error.message || "Impossible d'enregistrer le brouillon", "error");
    } finally {
      setSavingDraft(false);
    }
  }

  function prepareBafaToussaint2026() {
    const list = lists.find(l => l.name === "BAFA Toussaint 2026 - reservations + Cantal AURA")
      || lists.find(l => /bafa/i.test(l.name || ""));
    pickTemplate("bafa-toussaint-2026");
    setSourceMode("list");
    if (list) setListId(list.id);
    setReplyTo("equipe@colocrew.com");
    setSelectedSenders(SENDERS.map((_, i) => i));
    setDelayMs(3000);
    showToast(
      list
        ? `Campagne BAFA prête avec la liste "${list.name}" (${list.count || 0} contacts)`
        : "Campagne BAFA prête. Sélectionne la liste BAFA avant l'envoi.",
      list ? "success" : "info",
    );
  }

  function prepareJuillet2026() {
    const list = lists.find(l => l.name === "Offre juillet 2026 - priorite 1")
      || lists.find(l => l.name === "Offre juillet 2026 - tous");
    pickTemplate("juillet-2026");
    setSourceMode("list");
    if (list) setListId(list.id);
    setSelectedSenders(SENDERS.map((_, i) => i));
    setDelayMs(3000);
    setEditorMode("visual");
    showToast(
      list
        ? `Offre juillet 2026 prete avec la liste "${list.name}"`
        : "Offre juillet 2026 prete. Selectionnez une liste avant l'envoi.",
      list ? "success" : "info"
    );
  }

  function toggleSender(i) {
    setSelectedSenders(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  }

  function handleCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvContacts(rowsToContacts(parseCsv(ev.target.result).rows));
    reader.readAsText(file, "UTF-8");
  }

  async function sendTest() {
    if (!testEmail) return showToast("Renseignez l'adresse de test", "error");
    if (!subject || !html) return showToast("Renseignez l'objet et le contenu", "error");
    setTesting(true);
    const r = await fetch("/api/brevo/test-send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testEmail, sender: SENDERS[testSender], subject, htmlContent: html, replyTo }),
    }).then(r => r.json());
    showToast(r.ok ? `Test envoyé à ${testEmail}` : (r.error || "Erreur"), r.ok ? "success" : "error");
    setTesting(false);
  }

  async function launchDispatch() {
    if (!subject || !html) return showToast("Objet et contenu requis", "error");
    if (!replyTo) return showToast("L'adresse Reply-to est obligatoire — c'est là que vous recevrez les réponses", "error");
    if (!selectedSenders.length) return showToast("Sélectionnez au moins un expéditeur", "error");

    let contacts;
    let selectedListName = "";
    let estimatedTotal = 0;
    if (sourceMode === "list") {
      if (!listId) return showToast("Sélectionnez une liste", "error");
      selectedListName = selectedList?.name || "";
      estimatedTotal = Number(selectedList?.count || 0);
    } else {
      if (!csvContacts?.length) return showToast("Chargez un fichier CSV", "error");
      contacts = csvContacts;
      estimatedTotal = csvContacts.length;
    }

    const senders = selectedSenders.map(i => SENDERS[i]);
    const batchSize = delayMs >= 10000 ? 4 : delayMs >= 3000 ? 10 : 20;
    setDispatching(true);
    setProgress({ sent: 0, errors: 0, total: estimatedTotal, current: null });
    setDispatchDone(null);

    try {
      const res = await fetch("/api/brevo/dispatch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, senders, subject, htmlContent: html, replyTo, delayMs, sourceMode, listId, listName: selectedListName, maxPerRequest: batchSize }),
      });

      let runIdToResume = "";
      let shouldResume = false;

      const handleMessage = (msg) => {
        if (msg.type === "start") {
          runIdToResume = msg.runId;
          setActiveRunId(msg.runId);
          setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
        }
        if (msg.type === "ok" || msg.type === "err") {
          setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: msg.email });
        }
        if (msg.type === "batchDone") {
          runIdToResume = msg.runId;
          shouldResume = true;
          setActiveRunId(msg.runId);
          setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
        }
        if (msg.type === "paused" || msg.type === "stopped") {
          shouldResume = false;
          setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
        }
        if (msg.type === "done") {
          shouldResume = false;
          setDispatchDone(msg);
          setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
          showToast(`Terminé ! ${msg.sent}/${msg.total} emails envoyés`, "success");
        }
      };

      await consumeNdjson(res, handleMessage);
      if (runIdToResume) loadRun(runIdToResume);

      while (shouldResume && runIdToResume) {
        shouldResume = false;
        await new Promise(resolve => setTimeout(resolve, 800));
        const resumeRes = await fetch(`/api/brevo/runs/${runIdToResume}/resume`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxPerRequest: batchSize }),
        });
        await consumeNdjson(resumeRes, handleMessage);
      }
      if (runIdToResume) loadRun(runIdToResume);
    } catch (err) {
      showToast(err.message || "Erreur de connexion pendant l'envoi", "error");
    }
    setDispatching(false);
  }

  const pct = progress?.total ? Math.round((progress.sent / progress.total) * 100) : 0;
  const savedPct = savedRun?.total ? Math.round(((savedRun.sent || 0) / savedRun.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 1040 }}>

      {/* Templates */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <H2 mt={0}>Préparer la campagne</H2>
          <p style={{ margin: "-6px 0 0", fontSize: 13, color: "#64748b" }}>
            Choisis un modèle, une liste, teste le rendu, puis lance l'envoi. Le modèle actif reste visible.
          </p>
        </div>
        <button type="button" onClick={prepareBafaToussaint2026}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1.5px solid #111827", background: "#111827", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 800 }}>
          Préparer BAFA Toussaint
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 24 }}>
        {TEMPLATES.map(t => (
          <button key={t.key} type="button" onClick={() => pickTemplate(t.key)}
            style={{
              textAlign: "left",
              padding: "12px 13px",
              borderRadius: 8,
              border: `1.5px solid ${activeTemplateKey === t.key ? "#111827" : "#e2e8f0"}`,
              background: activeTemplateKey === t.key ? "#f9fafb" : "#fff",
              fontSize: 13,
              cursor: "pointer",
              color: "#1e293b",
              boxShadow: activeTemplateKey === t.key ? "0 8px 20px rgba(15,23,42,0.08)" : "none",
            }}>
            <span style={{ display: "block", fontWeight: 800, marginBottom: 5 }}>{t.label}</span>
            <span style={{ display: "block", color: "#64748b", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.subject || "Objet personnalisé"}
            </span>
            {activeTemplateKey === t.key && (
              <span style={{ display: "inline-flex", marginTop: 8, padding: "3px 8px", borderRadius: 999, background: "#111827", color: "#fff", fontSize: 11, fontWeight: 800 }}>
                Sélectionné
              </span>
            )}
          </button>
        ))}
        <button type="button" onClick={prepareJuillet2026}
          style={{ textAlign: "left", padding: "12px 13px", borderRadius: 8, border: "1.5px solid #7c3aed", background: "#f5f3ff", fontSize: 13, cursor: "pointer", fontWeight: 800, color: "#6d28d9" }}>
          Preparer l'envoi juillet 2026
        </button>
      </div>

      {drafts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Mails enregistrés</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {drafts.map(draft => {
              const active = draft.id === activeDraftId;
              return (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => pickDraft(draft)}
                  style={{
                    maxWidth: 280,
                    padding: "9px 12px",
                    borderRadius: 7,
                    border: `1.5px solid ${active ? "#111827" : "#d7dde5"}`,
                    background: active ? "#111827" : "#fff",
                    color: active ? "#fff" : "#24303f",
                    fontSize: 12,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                  title={draft.subject}
                >
                  {draft.name || draft.subject}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 22 }}>
        <div style={{ ...S.card, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Modèle</div>
          <div style={{ fontSize: 14, color: "#111827", fontWeight: 800, marginTop: 4 }}>
            {drafts.find((draft) => draft.id === activeDraftId)?.name
              || TEMPLATES.find((t) => t.key === activeTemplateKey)?.label
              || "Personnalisé"}
          </div>
        </div>
        <div style={{ ...S.card, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Liste</div>
          <div style={{ fontSize: 14, color: selectedList ? "#111827" : "#dc2626", fontWeight: 800, marginTop: 4 }}>
            {selectedList ? selectedList.name : "Aucune"}
          </div>
        </div>
        <div style={{ ...S.card, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Contacts</div>
          <div style={{ fontSize: 14, color: "#111827", fontWeight: 800, marginTop: 4 }}>
            {sourceMode === "list" ? (selectedList?.count || 0) : (csvContacts?.length || 0)}
          </div>
        </div>
        <div style={{ ...S.card, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Expéditeurs</div>
          <div style={{ fontSize: 14, color: "#111827", fontWeight: 800, marginTop: 4 }}>
            {selectedSenders.length}
          </div>
        </div>
      </div>

      {/* Objet + Reply-to */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <label style={S.label}>Objet de l'email</label>
          <input style={S.inputFull} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Objet visible par le destinataire" />
        </div>
        <div>
          <label style={S.label}>
            Reply-to — <strong style={{ color: "#dc2626" }}>les réponses de vos prospects arrivent ICI</strong>
          </label>
          <input
            style={{ ...S.inputFull, borderColor: replyTo ? "#e2e8f0" : "#fca5a5", background: replyTo ? "#fff" : "#fff7f7" }}
            type="email"
            value={replyTo}
            onChange={e => setReplyTo(e.target.value)}
            placeholder="equipe@colocrew.com"
          />
          {!replyTo && (
            <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4, fontWeight: 600 }}>
              ⚠ Champ obligatoire — sans reply-to, les réponses partent vers une adresse non surveillée
            </p>
          )}
          {replyTo && (
            <p style={{ fontSize: 12, color: "#059669", marginTop: 4 }}>
              ✓ Les prospects qui répondent écriront à <strong>{replyTo}</strong>
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: "1 1 320px" }}>
          <label style={S.label}>Nom du mail enregistré</label>
          <input
            style={S.inputFull}
            value={draftName}
            onChange={event => setDraftName(event.target.value)}
            placeholder="Ex. Séjours 2027 - version groupes"
          />
        </div>
        <Btn onClick={saveDraft} loading={savingDraft}>
          {activeDraftId ? "Enregistrer les modifications" : "Enregistrer ce mail"}
        </Btn>
      </div>

      {/* Editeur du contenu */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <label style={{ ...S.label, margin: 0 }}>Contenu du mail</label>
          <div role="tablist" aria-label="Mode d'édition" style={{ display: "inline-flex", padding: 3, border: "1px solid #d7dde5", borderRadius: 7, background: "#f8fafc" }}>
            {[
              { key: "visual", label: "Éditeur visuel" },
              { key: "html", label: "HTML" },
              { key: "preview", label: "Aperçu" },
            ].map((mode) => {
              const active = editorMode === mode.key;
              return (
                <button
                  key={mode.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setEditorMode(mode.key)}
                  style={{
                    minHeight: 32,
                    padding: "0 11px",
                    border: 0,
                    borderRadius: 5,
                    background: active ? "#24303f" : "transparent",
                    color: active ? "#fff" : "#526071",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
        {editorMode === "preview" ? (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", height: 440 }}>
            <iframe srcDoc={html} style={{ width: "100%", height: "100%", border: "none" }} sandbox="" title="Aperçu" />
          </div>
        ) : editorMode === "html" ? (
          <textarea value={html} onChange={e => setHtml(e.target.value)}
            spellCheck={false}
            style={{ ...S.inputFull, height: 420, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12, resize: "vertical", lineHeight: 1.5 }} />
        ) : (
          <EmailWysiwygEditor value={html} onChange={setHtml} />
        )}
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>
          Perso : <code>{"{{params.PRENOM}}"}</code> · <code>{"{{params.NOM}}"}</code> · Lien de désinscription : <code>{"{{unsubscribe}}"}</code> (ajouté automatiquement en bas du mail s'il manque)
        </p>
      </div>

      {/* Source contacts */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <H2 mt={0}>Source des contacts</H2>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[{ k: "list", l: "Depuis une liste sauvegardée" }, { k: "csv", l: "Importer un CSV maintenant" }].map(({ k, l }) => (
            <button key={k} type="button" onClick={() => setSourceMode(k)} style={{
              padding: "8px 16px", borderRadius: 8, border: "1.5px solid",
              borderColor: sourceMode === k ? "#7c3aed" : "#e2e8f0",
              background: sourceMode === k ? "#f5f3ff" : "#fff",
              color: sourceMode === k ? "#7c3aed" : "#475569",
              fontSize: 13, cursor: "pointer", fontWeight: 600,
            }}>{l}</button>
          ))}
        </div>
        {sourceMode === "list" ? (
          <>
            <select style={{ ...S.input, width: "100%", maxWidth: 520 }} value={listId} onChange={e => setListId(e.target.value)}>
              <option value="">Choisir une liste…</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count} contacts)</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 12 }}>
              {lists
                .filter((l) => /bafa|fiable|tous les mails uniques|colocrew news|focus/i.test(l.name || ""))
                .slice(0, 8)
                .map((l) => {
                  const active = l.id === listId;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setListId(l.id)}
                      style={{
                        textAlign: "left",
                        padding: "10px 11px",
                        borderRadius: 8,
                        border: `1.5px solid ${active ? "#111827" : "#e2e8f0"}`,
                        background: active ? "#f9fafb" : "#fff",
                        cursor: "pointer",
                        color: "#1e293b",
                      }}
                    >
                      <span style={{ display: "block", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.name}
                      </span>
                      <span style={{ display: "block", marginTop: 3, fontSize: 11, color: active ? "#111827" : "#64748b", fontWeight: active ? 800 : 600 }}>
                        {l.count || 0} contacts{active ? " · sélectionnée" : ""}
                      </span>
                    </button>
                  );
                })}
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>Format : <code>email,prenom,nom</code></p>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} style={{ fontSize: 13, cursor: "pointer" }} />
            {csvContacts && (
              <p style={{ fontSize: 13, color: "#059669", fontWeight: 600, marginTop: 8 }}>✓ {csvContacts.length} contacts valides chargés</p>
            )}
          </>
        )}
      </div>

      {/* Expéditeurs */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <H2 mt={0}>Expéditeurs en rotation</H2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          Domaine <strong>colocrew.com</strong> déjà vérifié — toutes ces adresses fonctionnent directement.
          Les emails seront envoyés en rotation circulaire entre les expéditeurs sélectionnés.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 6 }}>
          {SENDERS.map((s, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: selectedSenders.includes(i) ? "#ede9fe" : "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={selectedSenders.includes(i)} onChange={() => toggleSender(i)} />
              <div>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{s.email}</div>
              </div>
            </label>
          ))}
        </div>
        {selectedSenders.length > 0 && (
          <p style={{ fontSize: 12, color: "#7c3aed", marginTop: 10, fontWeight: 600 }}>
            {selectedSenders.length} expéditeur(s) sélectionné(s) — rotation circulaire automatique
          </p>
        )}
      </div>

      {/* Vitesse d'envoi */}
      <div style={{ marginBottom: 24 }}>
        <label style={S.label}>Vitesse d'envoi (délai entre chaque email)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SPEED_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setDelayMs(opt.value)} style={{
              padding: "8px 16px", borderRadius: 8, border: "1.5px solid",
              borderColor: delayMs === opt.value ? "#7c3aed" : "#e2e8f0",
              background: delayMs === opt.value ? "#f5f3ff" : "#fff",
              color: delayMs === opt.value ? "#7c3aed" : "#475569",
              fontSize: 13, cursor: "pointer", fontWeight: 600,
            }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Bouton lancer */}
      {!dispatching && !dispatchDone && (
        <Btn size="lg" onClick={launchDispatch}>Lancer la campagne</Btn>
      )}

      {/* Progression en temps réel */}
      {(dispatching || dispatchDone) && progress && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {dispatchDone ? "Envoi terminé ✓" : "Envoi en cours…"}
            </span>
            <span style={{ fontSize: 13, color: "#64748b" }}>{progress.sent} / {progress.total}</span>
          </div>
          <div style={{ background: "#e2e8f0", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", background: dispatchDone ? "#10b981" : "#7c3aed", width: `${pct}%`, transition: "width .4s ease" }} />
          </div>
          <div style={{ fontSize: 12, color: "#64748b", display: "flex", gap: 20 }}>
            <span style={{ color: "#10b981" }}>✓ {progress.sent} envoyés</span>
            {progress.errors > 0 && <span style={{ color: "#ef4444" }}>✗ {progress.errors} erreurs</span>}
            {!dispatchDone && progress.current && <span>En cours : {progress.current}</span>}
          </div>
          {dispatchDone && (
            <Btn variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => { setProgress(null); setDispatchDone(null); }}>
              Nouvelle campagne
            </Btn>
          )}
        </div>
      )}

      {savedRun && (
        <div style={{ ...S.card, marginTop: 20, marginBottom: 20, borderColor: savedRun.status === "running" ? "#7c3aed" : "#e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: 0 }}>Suivi sauvegarde de la campagne</h3>
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 0 }}>{savedRun.subject}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {savedRun.status === "running" && (
                <>
                  <Btn variant="ghost" size="sm" onClick={() => controlRun(savedRun.id, "pause")} loading={controllingRun}>Pause</Btn>
                  <Btn variant="danger" size="sm" onClick={() => controlRun(savedRun.id, "stop")} loading={controllingRun}>Stop</Btn>
                </>
              )}
              <Btn variant="ghost" size="sm" onClick={() => loadRun(savedRun.id)}>Actualiser</Btn>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Statut</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{savedRun.status}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Envoyes</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{savedRun.sent || 0} / {savedRun.total || 0}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Erreurs</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: savedRun.errors ? "#dc2626" : "#15803d" }}>{savedRun.errors || 0}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Progression</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{savedPct}%</div>
            </div>
          </div>
          {!['done', 'stopped', 'failed'].includes(savedRun.status) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginRight: 4 }}>Vitesse en cours</span>
              {SPEED_OPTIONS.map(option => {
                const active = Number(savedRun.delayMs) === option.value;
                return (
                  <Btn
                    key={option.value}
                    variant={active ? "primary" : "ghost"}
                    size="sm"
                    disabled={controllingRun}
                    onClick={() => controlRun(savedRun.id, "speed", { delayMs: option.value })}
                  >
                    {option.label.split(" — ")[0]} · {option.value / 1000} s
                  </Btn>
                );
              })}
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Appliquée au prochain email.</span>
            </div>
          )}
          <div style={{ background: "#e2e8f0", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", background: savedRun.status === "done" ? "#10b981" : "#7c3aed", width: `${savedPct}%`, transition: "width .4s ease" }} />
          </div>
          {savedRun.currentEmail && (
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
              En cours : <strong>{savedRun.currentEmail}</strong> via <strong>{savedRun.currentSender}</strong>
            </p>
          )}
          {!!savedEvents.length && (
            <div style={{ maxHeight: 180, overflowY: "auto", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
              {savedEvents.slice(0, 12).map(ev => (
                <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ color: ev.type === "error" ? "#dc2626" : "#15803d", fontWeight: 700 }}>{ev.type}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.email || ev.message || ""}</span>
                  <span style={{ color: "#64748b" }}>{ev.sender || ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test d'envoi */}
      <div style={{ ...S.card, marginTop: 32, background: "#fafafa" }}>
        <H2 mt={0}>🧪 Email de test</H2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          Envoie le contenu actuel vers une adresse de test. L'objet sera préfixé <code>[TEST]</code>, les variables remplacées par des exemples.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={S.label}>Adresse de destination</label>
            <input style={S.input} type="email" placeholder="ton@email.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Expéditeur du test</label>
            <select style={S.input} value={testSender} onChange={e => setTestSender(Number(e.target.value))}>
              {SENDERS.map((s, i) => <option key={i} value={i}>{s.email}</option>)}
            </select>
          </div>
          <Btn variant="success" onClick={sendTest} loading={testing}>Envoyer le test</Btn>
        </div>
      </div>

      {/* Conseils */}
      <div style={{ marginTop: 20, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "16px 20px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>⚠️ Anti-spam</h3>
        <ul style={{ fontSize: 12, color: "#78350f", lineHeight: 1.9, paddingLeft: 18 }}>
          <li>Commence par 50–100 emails/jour, augmente progressivement (warm-up)</li>
          <li>Privilégie le mode Lent ou Normal pour les grosses listes</li>
          <li>Planifie en heures ouvrées : mar–jeu, 10h–12h ou 14h–16h</li>
          <li>Les réponses arrivent dans la boîte du <strong>Reply-to</strong> configuré ci-dessus</li>
        </ul>
      </div>
    </div>
  );
}

// ── Tab: Historique ───────────────────────────────────────────────────────────

function Stat({ label, value }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#1e293b" }}>{value}</div>
    </div>
  );
}

function fmtMoney(value) {
  const n = Number(value || 0);
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

function TabHistoriqueFirebase() {
  const { showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [controlling, setControlling] = useState(false);

  const loadRun = useCallback(async (runId) => {
    const r = await fetch(`/api/brevo/runs/${runId}`).then(r => r.json());
    if (r.run) {
      setSelectedRun(r.run);
      setEvents(r.events || []);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/brevo/runs?limit=20").then(r => r.json());
      setRuns(r.runs || []);
      if (r.runs?.[0]) await loadRun(r.runs[0].id);
    } catch {
      showToast("Impossible de charger l'historique Firebase", "error");
    }
    setLoading(false);
  }, [loadRun, showToast]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  useEffect(() => {
    if (!selectedRun?.id || selectedRun.status !== "running") return;
    const timer = setInterval(() => loadRun(selectedRun.id), 3000);
    return () => clearInterval(timer);
  }, [selectedRun?.id, selectedRun?.status, loadRun]);

  function formatDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }

  async function resumeRun(runId) {
    if (!runId) return;
    setResuming(true);
    try {
      let keepGoing = true;
      const runDelay = Number(selectedRun?.id === runId ? selectedRun.delayMs : 3000);
      const batchSize = runDelay >= 10000 ? 4 : runDelay >= 3000 ? 10 : 20;

      while (keepGoing) {
        keepGoing = false;
        const res = await fetch(`/api/brevo/runs/${runId}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxPerRequest: batchSize }),
        });

        await consumeNdjson(res, msg => {
          if (msg.type === "batchDone") {
            keepGoing = true;
          }
          if (msg.type === "done") {
            showToast(`Reprise terminee : ${msg.sent}/${msg.total} emails envoyes`, "success");
            keepGoing = false;
          }
          if (msg.type === "paused" || msg.type === "stopped") {
            keepGoing = false;
          }
        });
        await loadRun(runId);

        if (keepGoing) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      await loadRuns();
    } catch (error) {
      showToast(error.message || "Erreur pendant la reprise de campagne", "error");
    }
    setResuming(false);
  }

  async function controlRun(runId, action, values = {}) {
    if (!runId) return;
    setControlling(true);
    try {
      const r = await fetch(`/api/brevo/runs/${runId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      }).then(r => r.json());
      const successMessage = action === "speed" ? "Vitesse modifiée" : `Demande ${action} envoyée`;
      showToast(r.ok ? successMessage : (r.error || "Erreur"), r.ok ? "success" : "error");
      await loadRun(runId);
    } catch {
      showToast("Impossible d'envoyer la demande", "error");
    }
    setControlling(false);
  }

  const pct = selectedRun?.total ? Math.round(((selectedRun.sent || 0) / selectedRun.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <H2 mt={0}>Historique Firebase</H2>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: -8 }}>
            Donnees issues des campagnes lancees depuis l'outil ColoCrew.
          </p>
        </div>
        <Btn variant="ghost" size="sm" onClick={loadRuns} loading={loading}>Actualiser</Btn>
      </div>

      {loading && !runs.length ? (
        <p style={{ color: "#94a3b8", fontSize: 14 }}>Chargement de l'historique...</p>
      ) : !runs.length ? (
        <div style={{ ...S.card, color: "#64748b", fontSize: 14 }}>Aucune campagne sauvegardee pour le moment.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map(run => {
              const runPct = run.total ? Math.round(((run.sent || 0) / run.total) * 100) : 0;
              const active = selectedRun?.id === run.id;
              return (
                <button key={run.id} type="button" onClick={() => loadRun(run.id)}
                  style={{
                    textAlign: "left",
                    background: active ? "#111827" : "#fff",
                    border: `1.5px solid ${active ? "#111827" : "#e2e8f0"}`,
                    borderRadius: 8,
                    padding: 12,
                    cursor: "pointer",
                    boxShadow: active ? "0 10px 24px rgba(15,23,42,0.16)" : "none",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <strong style={{ fontSize: 13, color: active ? "#fff" : "#1e293b" }}>
                      {active ? "Sélectionnée · " : ""}{run.status}
                    </strong>
                    <span style={{ fontSize: 12, color: active ? "#fbbf24" : "#64748b", fontWeight: 800 }}>{runPct}%</span>
                  </div>
                  <div style={{ fontSize: 12, color: active ? "#e5e7eb" : "#475569", lineHeight: 1.4, marginBottom: 6 }}>{run.subject}</div>
                  <div style={{ height: 5, borderRadius: 999, overflow: "hidden", background: active ? "rgba(255,255,255,0.18)" : "#e2e8f0", marginBottom: 7 }}>
                    <div style={{ width: `${runPct}%`, height: "100%", background: run.status === "done" ? "#10b981" : "#f59e0b" }} />
                  </div>
                  <div style={{ fontSize: 11, color: active ? "#cbd5e1" : "#94a3b8" }}>{formatDate(run.createdAt)}</div>
                </button>
              );
            })}
          </div>

          {selectedRun && (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", margin: 0 }}>{selectedRun.subject}</h3>
                  <p style={{ fontSize: 12, color: "#64748b", marginTop: 5, marginBottom: 0 }}>
                    Lancee le {formatDate(selectedRun.createdAt)} - Reply-to {selectedRun.replyTo}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["interrupted", "paused"].includes(selectedRun.status) && selectedRun.canResume && (
                    <Btn size="sm" onClick={() => resumeRun(selectedRun.id)} loading={resuming}>Reprendre</Btn>
                  )}
                  {selectedRun.status === "running" && (
                    <>
                      <Btn variant="ghost" size="sm" onClick={() => controlRun(selectedRun.id, "pause")} loading={controlling}>Pause</Btn>
                      <Btn variant="danger" size="sm" onClick={() => controlRun(selectedRun.id, "stop")} loading={controlling}>Stop</Btn>
                    </>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => loadRun(selectedRun.id)}>Actualiser</Btn>
                </div>
              </div>

              {["interrupted", "paused"].includes(selectedRun.status) && !selectedRun.canResume && (
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: 10, color: "#9a3412", fontSize: 12, marginBottom: 12 }}>
                  Cette ancienne campagne ne peut pas etre reprise automatiquement, car elle a ete lancee avant la sauvegarde de la liste et du contenu HTML.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Statut</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedRun.status}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Envoyes</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedRun.sent || 0} / {selectedRun.total || 0}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Erreurs</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: selectedRun.errors ? "#dc2626" : "#15803d" }}>{selectedRun.errors || 0}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Progression</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{pct}%</div>
                </div>
              </div>

              {selectedRun.canResume && !['done', 'stopped', 'failed'].includes(selectedRun.status) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginRight: 4 }}>Vitesse en cours</span>
                  {SPEED_OPTIONS.map(option => {
                    const active = Number(selectedRun.delayMs) === option.value;
                    return (
                      <Btn
                        key={option.value}
                        variant={active ? "primary" : "ghost"}
                        size="sm"
                        disabled={controlling}
                        onClick={() => controlRun(selectedRun.id, "speed", { delayMs: option.value })}
                      >
                        {option.label.split(" — ")[0]} · {option.value / 1000} s
                      </Btn>
                    );
                  })}
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>Appliquée au prochain email.</span>
                </div>
              )}

              <div style={{ background: "#e2e8f0", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", background: selectedRun.status === "done" ? "#10b981" : "#7c3aed", width: `${pct}%`, transition: "width .4s ease" }} />
              </div>

              {selectedRun.currentEmail && (
                <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  En cours : <strong>{selectedRun.currentEmail}</strong> via <strong>{selectedRun.currentSender}</strong>
                </p>
              )}

              <H2 mt={18}>Derniers evenements</H2>
              {!events.length ? (
                <p style={{ color: "#94a3b8", fontSize: 13 }}>Aucun evenement enregistre.</p>
              ) : (
                <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                  {events.map(ev => (
                    <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "80px minmax(0, 1fr) 170px 120px", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                      <strong style={{ color: ev.type === "error" ? "#dc2626" : "#15803d" }}>{ev.type}</strong>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.email || ev.message || ""}</span>
                      <span style={{ color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.sender || ""}</span>
                      <span style={{ color: "#94a3b8" }}>{formatDate(ev.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabHistoriqueLegacy() {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#15803d", marginBottom: 10 }}>📩 Lire les réponses à vos campagnes</h3>
        <p style={{ fontSize: 14, color: "#166534", lineHeight: 1.8 }}>
          Les réponses de vos prospects arrivent directement dans la boîte mail de l'adresse <strong>Reply-to</strong> que tu configures dans chaque campagne.<br /><br />
          Si tu mets <code>equipe@colocrew.com</code> comme reply-to → tu les reçois dans cette boîte.<br />
          Si tu mets <code>dreyer.wil@gmail.com</code> → tu les reçois sur Gmail.
        </p>
      </div>
      <div style={{ marginTop: 16, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>📊 Suivi des envois</h3>
        <p style={{ fontSize: 14, color: "#1e40af", lineHeight: 1.7 }}>
          Les statistiques d'ouverture et de clics sont visibles directement dans ton compte Brevo (tableau de bord Brevo en ligne), dans la section <strong>Transactionnel → Logs d'emails</strong>.
        </p>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Campagnes() {
  const { showToast } = useToast();
  const [tab,   setTab]   = useState("campagne");
  const [lists, setLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const r = await fetch("/api/brevo/lists").then(r => r.json());
      setLists(r.lists || []);
    } catch {
      showToast("Impossible de charger les listes", "error");
    }
    setLoadingLists(false);
  }, [showToast]);

  useEffect(() => { loadLists(); }, [loadLists]);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ padding: "24px 32px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Campagnes email</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          Prospection par email · SMTP Brevo · 4 expéditeurs @colocrew.com · domaine vérifié
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e2e8f0", marginBottom: 30, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "9px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
              color: tab === t.key ? "#7c3aed" : "#64748b",
              borderBottom: `2px solid ${tab === t.key ? "#7c3aed" : "transparent"}`,
              marginBottom: -2,
            }}>{t.label}</button>
          ))}
        </div>

        {loadingLists ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#94a3b8", fontSize: 14 }}>
            <span style={{ width: 16, height: 16, border: "2px solid #e2e8f0", borderTopColor: "#7c3aed", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />
            Chargement…
          </div>
        ) : (
          <>
            {tab === "contacts"   && <TabContacts lists={lists} setLists={setLists} />}
            {tab === "campagne"   && <TabCampagne lists={lists} />}
            {tab === "historique" && <TabHistoriqueFirebase />}
          </>
        )}
      </div>
    </>
  );
}
