"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/src/lib/firebase";
import styles from "./editor.module.css";

const Context = createContext(null);
export function textKey(text) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
export default function InlineEditor({ children }) {
  const [texts, setTexts] = useState({});
  const [catalog, setCatalog] = useState({});
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef(null);
  const register = useCallback((key, value) => setCatalog(prev => prev[key] === value ? prev : { ...prev, [key]: value }), []);
  useEffect(() => {
    let alive = true, generation = 0;
    fetch("/api/edito-texts").then(r => r.ok ? r.json() : Promise.reject()).then(data => { if (alive) setTexts(data.texts); }).catch(() => { if (alive) setNotice("Les textes enregistrés n’ont pas pu être chargés. Recharge la page avant de modifier."); });
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const current = ++generation;
      setAdmin(false); setEditing(false); setSelected("");
      if (!user || user.isAnonymous) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/edito-texts", { headers: { Authorization: "Bearer " + token } });
        const data = await response.json();
        if (alive && current === generation && response.ok && data.admin) { setAdmin(true); setTexts(data.texts); setNotice(""); }
      } catch { /* Editing stays disabled when authorization cannot be verified. */ }
    });
    return () => { alive = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (selected && admin) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected, admin]);
  const open = useCallback((key, original) => {
    setSelected(key); setDraft(texts[key] ?? original); setError("");
  }, [texts]);
  const save = async event => {
    event.preventDefault();
    if (!admin || !auth.currentUser || busy) return;
    setBusy(true); setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/edito-texts", { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ key: selected, text: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Enregistrement impossible.");
      setTexts(prev => ({ ...prev, [selected]: data.text })); setSelected(""); setNotice("Texte enregistré et publié.");
    } catch (err) { setError(err.message || "Enregistrement impossible."); }
    finally { setBusy(false); }
  };
  return <Context.Provider value={{ texts, register, editing: admin && editing, open }}>
    {admin && <div className={styles.toolbar}>
      <span>Administration de la page</span>
      <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? "Terminer l’édition" : "Modifier les textes"}</button>
      {editing && <button type="button" onClick={() => { const key = Object.keys(catalog)[0]; if (key) open(key,catalog[key]); }}>Liste des textes</button>}
      <span role="status">{notice || (editing ? "Clique sur un texte pour le modifier." : "")}</span>
    </div>}
    {children}
    {admin && <dialog className={styles.dialog} ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) setSelected(""); }}>
      <form onSubmit={save}>
        <h2>Modifier le texte</h2>
        <label>Texte de la page<select value={selected} disabled={busy} onChange={e => open(e.target.value,catalog[e.target.value])}>
          {Object.entries(catalog).map(([key,value]) => <option key={key} value={key}>{value.slice(0,100)}</option>)}
        </select></label>
        <label>Nouveau texte<textarea autoFocus value={draft} maxLength={8000} required disabled={busy} onChange={e => setDraft(e.target.value)} rows={7} /></label>
        <p>La modification sera visible par tous après enregistrement.</p>
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => setSelected("")}>Annuler</button><button type="submit" disabled={busy || !draft.trim()}>{busy ? "Enregistrement…" : "Enregistrer"}</button></div>
      </form>
    </dialog>}
  </Context.Provider>;
}
export function useEditableText(original) {
  const context = useContext(Context);
  const value = typeof original === "string" ? original : "";
  const key = textKey(value);
  const register = context?.register;
  useEffect(() => { if (register && value.trim()) register(key,value); }, [register,key,value]);
  return { value: context?.texts[key] ?? original, key, context };
}
export function EditableText({ children, as: Tag = "span", ...props }) {
  const { value, key, context } = useEditableText(children);
  const editable = context?.editing && typeof children === "string" && children.trim() && Tag !== "option";
  return <Tag {...props} className={editable ? styles.editable : undefined} tabIndex={editable ? 0 : undefined}
    onClick={editable ? e => { e.preventDefault(); e.stopPropagation(); context.open(key,children); } : undefined}
    onKeyDown={editable ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); context.open(key,children); } } : undefined}>{value}</Tag>;
}
