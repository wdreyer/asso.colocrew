"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import Modal from "@/src/components/dashboard/ui/Modal";
import Badge from "@/src/components/dashboard/ui/Badge";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import WysiwygEditor from "@/src/components/dashboard/ui/WysiwygEditor";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { DASHBOARD_COLLECTIONS } from "@/src/lib/dashboardCollections";

export default function Blog() {
  const [openModal, setOpenModal] = useState(false);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ titre: "", saison: "", slug: "", statut: "Brouillon", excerptHtml: "" });
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, DASHBOARD_COLLECTIONS.BLOG));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      showToast("Erreur de chargement du blog draft", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    if (!form.titre.trim()) {
      showToast("Titre requis", "warning");
      return;
    }

    try {
      await addDoc(collection(db, DASHBOARD_COLLECTIONS.BLOG), {
        ...form,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setOpenModal(false);
      setForm({ titre: "", saison: "", slug: "", statut: "Brouillon", excerptHtml: "" });
      load();
      showToast("Article draft créé", "success");
    } catch {
      showToast("Erreur de création de l'article", "error");
    }
  };

  const toggleStatut = async (row) => {
    const next = row.statut === "Publié" ? "Brouillon" : "Publié";
    try {
      await updateDoc(doc(db, DASHBOARD_COLLECTIONS.BLOG, row.id), {
        statut: next,
        updatedAt: serverTimestamp(),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, statut: next } : x)));
      showToast(`Statut ${next}`, "success");
    } catch {
      showToast("Erreur de mise à jour du statut", "error");
    }
  };

  const columns = useMemo(
    () => [
      { key: "titre", label: "Titre" },
      { key: "saison", label: "Saison" },
      {
        key: "statut",
        label: "Statut",
        render: (row) => <Badge label={row.statut || "Brouillon"} variant={row.statut === "Publié" ? "success" : "warning"} />,
      },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <button type="button" className="dash-btn" onClick={() => toggleStatut(row)}>
            {row.statut === "Publié" ? "Dépublier" : "Publier"}
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Blog & Souvenirs (draft Firebase)</h1>
          <p>Édition sans impact sur le site en production.</p>
        </div>
        <button type="button" className="dash-btn dash-btn-primary" onClick={() => setOpenModal(true)}>
          Nouvel article
        </button>
      </header>

      {loading ? <p className="dash-muted">Chargement...</p> : <DataTable columns={columns} data={items} />}

      <Modal isOpen={openModal} onClose={() => setOpenModal(false)} title="Nouvel article draft" size="md">
        <div className="dash-form-grid">
          <label>Titre<input className="dash-input" value={form.titre} onChange={(e) => setForm((p) => ({ ...p, titre: e.target.value }))} /></label>
          <label>Saison<input className="dash-input" value={form.saison} onChange={(e) => setForm((p) => ({ ...p, saison: e.target.value }))} /></label>
          <label>Slug<input className="dash-input" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} /></label>
          <label>
            Statut
            <select className="dash-input" value={form.statut} onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value }))}>
              <option>Brouillon</option>
              <option>Publié</option>
            </select>
          </label>
        </div>

        <label className="dash-field-col" style={{ marginTop: 12 }}>
          Extrait (WYSIWYG)
          <WysiwygEditor value={form.excerptHtml} onChange={(html) => setForm((p) => ({ ...p, excerptHtml: html }))} minHeight={180} />
        </label>

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={() => setOpenModal(false)}>
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
