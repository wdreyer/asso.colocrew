"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Modal from "@/src/components/dashboard/ui/Modal";
import PhotoPicker from "@/src/components/dashboard/ui/PhotoPicker";
import { useToast } from "@/src/contexts/ToastContext";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const SEJOUR_OPTIONS = [
  { value: "my-creative-surf-camp-2025", label: "My Creative Surf Camp 2025" },
  { value: "ski-and-music-2025", label: "Ski and Music 2025" },
];

const INITIAL_FORM = {
  identite: "",
  type: "parent",
  sejour: "my-creative-surf-camp-2025",
  date: "",
  retourQualitatif: "",
  note: 10,
  photoUrl: "",
  photoPath: "",
};

function normalizeFilename(name) {
  const safe = String(name || "photo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "");
  const dotIndex = safe.lastIndexOf(".");
  if (dotIndex <= 0) return `${safe || "photo"}.jpg`;
  const base = safe.slice(0, dotIndex) || "photo";
  const ext = safe.slice(dotIndex + 1) || "jpg";
  return `${base}.${ext}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fr-FR");
}

function sejourLabel(value) {
  return SEJOUR_OPTIONS.find((item) => item.value === value)?.label || value || "-";
}

export default function Temoignages() {
  const { showToast } = useToast();

  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [openEditor, setOpenEditor] = useState(false);
  const [globalPickerOpen, setGlobalPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const retoursSnap = await getDocs(collection(db, "retours"));
      const mapped = retoursSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mapped.sort((a, b) => {
        const aDate = new Date(a.date || 0).getTime();
        const bDate = new Date(b.date || 0).getTime();
        return bDate - aDate;
      });
      setItems(mapped);
    } catch {
      showToast("Erreur de chargement des retours", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setOpenEditor(true);
  };

  const openEditModal = (row) => {
    setEditingId(row.id);
    setForm({
      identite: row.identite || "",
      type: row.type || "parent",
      sejour: row.sejour || "my-creative-surf-camp-2025",
      date: row.date || "",
      retourQualitatif: row.retourQualitatif || "",
      note: Number(row.note || 0),
      photoUrl: row.photoUrl || "",
      photoPath: row.photoPath || "",
    });
    setOpenEditor(true);
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const filename = normalizeFilename(file.name);
      const storagePath = `retours/${Date.now()}-${filename}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, COLLECTIONS.PHOTOS), {
        nom: filename,
        album: "retours",
        url: photoUrl,
        storagePath,
        dateAjout: serverTimestamp(),
        taille: Number(file.size || 0),
        ordre: 0,
      });

      setForm((prev) => ({ ...prev, photoUrl, photoPath: storagePath }));
      showToast("Photo uploadee", "success");
    } catch {
      showToast("Erreur upload photo", "error");
    } finally {
      setUploading(false);
    }
  };

  const removeItem = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`Supprimer le témoignage "${row.identite || "Anonyme"}" ?`)) return;
    try {
      await deleteDoc(doc(db, "retours", row.id));
      setItems((prev) => prev.filter((item) => item.id !== row.id));
      showToast("Temoignage supprime", "success");
    } catch {
      showToast("Erreur suppression temoignage", "error");
    }
  };

  const onSave = async () => {
    if (!form.identite.trim() || !form.retourQualitatif.trim()) {
      showToast("Identite et retour qualitatif sont requis", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        identite: form.identite.trim(),
        type: form.type,
        sejour: form.sejour,
        date: form.date || null,
        retourQualitatif: form.retourQualitatif.trim(),
        note: Number(form.note || 0),
        photoUrl: form.photoUrl || "",
        photoPath: form.photoPath || "",
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "retours", editingId), payload);
      } else {
        await addDoc(collection(db, "retours"), {
          ...payload,
          source: "manual_dashboard",
          createdAt: serverTimestamp(),
        });
      }

      setOpenEditor(false);
      setForm(INITIAL_FORM);
      setEditingId(null);
      showToast(editingId ? "Retour modifie" : "Retour ajoute", "success");
      await load();
    } catch {
      showToast("Erreur sauvegarde retour", "error");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ["Identite", "Type", "Sejour", "Date", "Note /10", "Retour qualitatif", "Photo"];
    const rows = items.map((item) => [
      item.identite || "",
      item.type || "",
      sejourLabel(item.sejour),
      item.date || "",
      item.note ?? "",
      item.retourQualitatif || "",
      item.photoUrl || "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "retours-qualitatifs.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo(
    () => [
      { key: "identite", label: "Identite" },
      { key: "type", label: "Type", filterable: true, filterLabel: "Tous les types" },
      { key: "sejour", label: "Sejour", filterable: true, filterLabel: "Tous les sejours", render: (row) => sejourLabel(row.sejour) },
      { key: "date", label: "Date", render: (row) => formatDate(row.date) },
      { key: "note", label: "Note /10" },
      {
        key: "retourQualitatif",
        label: "Retour qualitatif",
        render: (row) => <span className="dash-truncate">{row.retourQualitatif || "-"}</span>,
      },
      {
        key: "photoUrl",
        label: "Photo",
        render: (row) =>
          row.photoUrl ? (
            <img src={row.photoUrl} alt={row.identite || "retour"} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />
          ) : (
            "-"
          ),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <div className="dash-row-actions">
            <button
              type="button"
              className="dash-btn"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(row);
              }}
            >
              Editer
            </button>
            <button
              type="button"
              className="dash-btn dash-btn-danger"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(row);
              }}
            >
              Supprimer
            </button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Retours qualitatifs</h1>
          <p>Edition en modale, filtre/tri et choix photo depuis /photos.</p>
        </div>
        <div className="dash-row-actions">
          <button type="button" className="dash-btn" onClick={exportCsv}>
            Exporter CSV
          </button>
          <button type="button" className="dash-btn" onClick={load}>
            Actualiser
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={openCreateModal}>
            Ajouter
          </button>
        </div>
      </header>

      <section className="dash-homepage-editor-section">
        <h3>Retours en base</h3>
        {loading ? (
          <p className="dash-muted">Chargement...</p>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            searchableKeys={["identite", "type", "sejour", "retourQualitatif"]}
            defaultSortKey="date"
            defaultSortDirection="desc"
            onRowClick={openEditModal}
            toolsInline
          />
        )}
      </section>

      <Modal
        isOpen={openEditor}
        onClose={() => {
          setOpenEditor(false);
          setEditingId(null);
          setForm(INITIAL_FORM);
        }}
        title={editingId ? "Modifier le retour" : "Ajouter un retour"}
        size="lg"
      >
        <div className="dash-form-grid">
          <label>
            Identite
            <input className="dash-input" value={form.identite} onChange={(e) => setForm((prev) => ({ ...prev, identite: e.target.value }))} />
          </label>
          <label>
            Type
            <select className="dash-input" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="parent">Parent</option>
              <option value="jeune">Jeune</option>
            </select>
          </label>
          <label>
            Sejour
            <select className="dash-input" value={form.sejour} onChange={(e) => setForm((prev) => ({ ...prev, sejour: e.target.value }))}>
              {SEJOUR_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" className="dash-input" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
          </label>
          <label>
            Note /10
            <input type="number" min="0" max="10" step="0.1" className="dash-input" value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: Number(e.target.value) }))} />
          </label>
          <label>
            Upload photo
            <input
              type="file"
              accept="image/*"
              className="dash-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                uploadPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
          <label className="dash-span-2">
            Photo (URL)
            <div className="dash-copy-field">
              <input className="dash-input" value={form.photoUrl} onChange={(e) => setForm((prev) => ({ ...prev, photoUrl: e.target.value }))} />
              <button type="button" className="dash-btn" onClick={() => setGlobalPickerOpen(true)}>
                Choisir dans la bibliothèque
              </button>
            </div>
          </label>
          <label className="dash-span-2">
            Retour qualitatif
            <textarea className="dash-input" rows={6} value={form.retourQualitatif} onChange={(e) => setForm((prev) => ({ ...prev, retourQualitatif: e.target.value }))} />
          </label>
        </div>

        {form.photoUrl ? (
          <div className="dash-home-thumb" style={{ maxWidth: 380, marginTop: 12 }}>
            <img src={form.photoUrl} alt="Apercu commentaire" />
          </div>
        ) : (
          <p className="dash-muted" style={{ marginTop: 12 }}>Aucune photo selectionnee.</p>
        )}

        <div className="dash-modal-actions">
          <button
            type="button"
            className="dash-btn"
            onClick={() => {
              setOpenEditor(false);
              setEditingId(null);
              setForm(INITIAL_FORM);
            }}
          >
            Annuler
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={onSave} disabled={saving || uploading}>
            {saving ? "Enregistrement..." : editingId ? "Mettre a jour" : "Ajouter"}
          </button>
        </div>
      </Modal>

      <PhotoPicker
        isOpen={globalPickerOpen}
        onClose={() => setGlobalPickerOpen(false)}
        onSelect={(url) => {
          setForm((prev) => ({ ...prev, photoUrl: url, photoPath: "" }));
          setGlobalPickerOpen(false);
        }}
        title="Choisir une photo pour le témoignage"
      />
    </div>
  );
}
