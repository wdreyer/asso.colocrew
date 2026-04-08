"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import Badge from "@/src/components/dashboard/ui/Badge";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import Modal from "@/src/components/dashboard/ui/Modal";
import WysiwygEditor from "@/src/components/dashboard/ui/WysiwygEditor";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { DASHBOARD_COLLECTIONS } from "@/src/lib/dashboardCollections";

const STATIC_SEED = [
  {
    nom: "Accueil - Bloc éditorial",
    path: "/",
    body: `<h2>ColoCrew ? 🙌</h2><p>Nous sommes une association qui porte les valeurs de l'éducation populaire et qui souhaite offrir à tous les enfants les vacances qu'ils méritent, peu importe d'où ils viennent ou leur situation économique.</p>`,
    heroImage: "/load.png",
  },
  {
    nom: "Mentions légales",
    path: "/mentions-legales",
    body: `<h2>Mentions légales</h2><p>Informations légales et de conformité de l'association ColoCrew.</p>`,
    heroImage: "",
  },
  {
    nom: "RGPD",
    path: "/rgpd",
    body: `<h2>Protection des données</h2><p>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles.</p>`,
    heroImage: "",
  },
  {
    nom: "Conditions générales de ventes",
    path: "/conditions-generales-de-ventes",
    body: `<h2>Conditions générales de ventes</h2><p>Retrouvez ici les conditions applicables aux réservations ColoCrew.</p>`,
    heroImage: "",
  },
  {
    nom: "Qui sommes-nous",
    path: "/qui-sommes-nous",
    body: `<h2>L'association ColoCrew</h2><p>Une pédagogie populaire, des séjours à taille humaine, et une équipe engagée.</p>`,
    heroImage: "",
  },
];

const EMPTY_FORM = {
  nom: "",
  path: "",
  heroImage: "",
  body: "",
  status: "draft",
  dataJson: "{}",
};

function prettyJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function Pages() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, DASHBOARD_COLLECTIONS.PAGES), orderBy("createdAt", "desc")));
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (!docs.length) {
        for (const page of STATIC_SEED) {
          await addDoc(collection(db, DASHBOARD_COLLECTIONS.PAGES), {
            ...page,
            data: {},
            status: "draft",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        const seeded = await getDocs(query(collection(db, DASHBOARD_COLLECTIONS.PAGES), orderBy("createdAt", "desc")));
        docs = seeded.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      setItems(docs);
    } catch (_err) {
      showToast("Erreur de chargement des contenus", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const onEdit = (item) => {
    setSelectedId(item.id);
    setForm({
      nom: item.nom || "",
      path: item.path || "",
      heroImage: item.heroImage || "",
      body: item.body || "",
      status: item.status || "draft",
      dataJson: prettyJson(item.data || {}),
    });
    setOpen(true);
  };

  const onSave = async () => {
    if (!form.nom.trim() || !form.path.trim()) {
      showToast("Nom et chemin requis", "warning");
      return;
    }

    let parsedData = {};
    try {
      parsedData = JSON.parse(form.dataJson || "{}");
    } catch {
      showToast("JSON invalide dans métadonnées", "error");
      return;
    }

    const payload = {
      nom: form.nom.trim(),
      path: form.path.trim(),
      heroImage: form.heroImage.trim(),
      body: form.body,
      status: form.status,
      data: parsedData,
      updatedAt: serverTimestamp(),
    };

    try {
      if (selectedId) {
        await updateDoc(doc(db, DASHBOARD_COLLECTIONS.PAGES, selectedId), payload);
      } else {
        await addDoc(collection(db, DASHBOARD_COLLECTIONS.PAGES), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      showToast("Contenu draft sauvegardé", "success");
      setOpen(false);
      load();
    } catch (_err) {
      showToast("Erreur sauvegarde contenu", "error");
    }
  };

  const columns = useMemo(
    () => [
      { key: "nom", label: "Page / Bloc" },
      { key: "path", label: "Chemin" },
      {
        key: "status",
        label: "État",
        render: (row) => <Badge label={row.status === "published" ? "Publié" : "Draft Firebase"} variant={row.status === "published" ? "success" : "info"} />,
      },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <button type="button" className="dash-btn" onClick={() => onEdit(row)}>
            Éditer
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
          <h1>Pages du site (draft Firebase)</h1>
          <p>WYSIWYG + image. Le site en ligne n'utilise pas encore ces contenus.</p>
        </div>
        <button type="button" className="dash-btn dash-btn-primary" onClick={onCreate}>
          Nouveau contenu
        </button>
      </header>

      <aside className="dash-info-box">
        Les contenus sont enregistrés dans <strong>{DASHBOARD_COLLECTIONS.PAGES}</strong>. Tant qu'on ne branche pas le front dessus, aucun impact en production.
      </aside>

      {loading ? <p className="dash-muted">Chargement...</p> : <DataTable columns={columns} data={items} />}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={selectedId ? "Éditer le contenu" : "Nouveau contenu"} size="lg">
        <div className="dash-form-grid">
          <label>
            Nom
            <input className="dash-input" value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
          </label>
          <label>
            Chemin
            <input className="dash-input" value={form.path} onChange={(e) => setForm((p) => ({ ...p, path: e.target.value }))} />
          </label>
          <label className="dash-span-2">
            Image principale (URL)
            <input className="dash-input" value={form.heroImage} onChange={(e) => setForm((p) => ({ ...p, heroImage: e.target.value }))} />
          </label>
        </div>

        <label className="dash-field-col" style={{ marginTop: 12 }}>
          Contenu HTML (éditeur WYSIWYG)
          <WysiwygEditor value={form.body} onChange={(html) => setForm((p) => ({ ...p, body: html }))} minHeight={260} />
        </label>

        <label className="dash-field-col" style={{ marginTop: 12 }}>
          Métadonnées JSON (textes/images structurés)
          <textarea className="dash-input" rows="8" value={form.dataJson} onChange={(e) => setForm((p) => ({ ...p, dataJson: e.target.value }))} />
        </label>

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={() => setOpen(false)}>
            Fermer
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={onSave}>
            Sauvegarder
          </button>
        </div>
      </Modal>
    </div>
  );
}

