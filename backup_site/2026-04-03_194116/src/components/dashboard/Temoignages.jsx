"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Modal from "@/src/components/dashboard/ui/Modal";
import WysiwygEditor from "@/src/components/dashboard/ui/WysiwygEditor";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { DASHBOARD_COLLECTIONS } from "@/src/lib/dashboardCollections";

const INITIAL_FORM = {
  auteur: "",
  type: "parent",
  note: 10,
  extraitHtml: "",
  sejour: "",
};

export default function Temoignages() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, DASHBOARD_COLLECTIONS.TEMOIGNAGES));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      showToast("Erreur de chargement des témoignages", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    if (!form.extraitHtml.trim()) {
      showToast("Extrait requis", "warning");
      return;
    }

    try {
      await addDoc(collection(db, DASHBOARD_COLLECTIONS.TEMOIGNAGES), {
        ...form,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setOpen(false);
      setForm(INITIAL_FORM);
      load();
      showToast("Témoignage draft ajouté", "success");
    } catch {
      showToast("Erreur ajout témoignage", "error");
    }
  };

  const exportCsv = () => {
    const header = ["Auteur", "Type", "Note", "Extrait", "Séjour"];
    const rows = items.map((t) => [t.auteur, t.type, t.note, t.extraitHtml, t.sejour]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "temoignages-draft.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo(
    () => [
      { key: "auteur", label: "Auteur" },
      { key: "type", label: "Type" },
      { key: "note", label: "Note" },
      { key: "extraitHtml", label: "Extrait", render: (row) => <span className="dash-truncate" dangerouslySetInnerHTML={{ __html: row.extraitHtml || "" }} /> },
      { key: "sejour", label: "Séjour" },
    ],
    [],
  );

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Témoignages (draft Firebase)</h1>
          <p>Ajout et export CSV des avis en brouillon.</p>
        </div>
        <div className="dash-row-actions">
          <button type="button" className="dash-btn" onClick={exportCsv}>
            Exporter
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => setOpen(true)}>
            Ajouter
          </button>
        </div>
      </header>

      {loading ? <p className="dash-muted">Chargement...</p> : <DataTable columns={columns} data={items} />}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Ajouter un témoignage draft" size="md">
        <div className="dash-form-grid">
          <label>Auteur<input className="dash-input" value={form.auteur} onChange={(e) => setForm((p) => ({ ...p, auteur: e.target.value }))} /></label>
          <label>
            Type
            <select className="dash-input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="parent">parent</option>
              <option value="jeune">jeune</option>
            </select>
          </label>
          <label>Note<input className="dash-input" type="number" min="0" max="10" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: Number(e.target.value) }))} /></label>
          <label>Séjour<input className="dash-input" value={form.sejour} onChange={(e) => setForm((p) => ({ ...p, sejour: e.target.value }))} /></label>
        </div>

        <label className="dash-field-col" style={{ marginTop: 12 }}>
          Extrait (WYSIWYG)
          <WysiwygEditor value={form.extraitHtml} onChange={(html) => setForm((p) => ({ ...p, extraitHtml: html }))} minHeight={200} />
        </label>

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={() => setOpen(false)}>
            Fermer
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={onCreate}>
            Enregistrer
          </button>
        </div>
      </Modal>
    </div>
  );
}
