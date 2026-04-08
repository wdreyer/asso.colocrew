"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import Modal from "@/src/components/dashboard/ui/Modal";
import Badge from "@/src/components/dashboard/ui/Badge";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import WysiwygEditor from "@/src/components/dashboard/ui/WysiwygEditor";
import PhotoPicker from "@/src/components/dashboard/ui/PhotoPicker";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { DASHBOARD_COLLECTIONS } from "@/src/lib/dashboardCollections";

const EMPTY_FORM = {
  titre: "",
  saison: "",
  slug: "",
  statut: "Publié",
  category: "",
  image: "",
  href: "",
  sortOrder: 100,
  excerptHtml: "",
  contentHtml: "",
};

const DEFAULT_BLOG_SEED = [
  {
    id: "home-blog-1",
    titre: "Pourquoi le surf est le meilleur sport pour apprendre à tomber (et se relever)",
    saison: "Été 2026",
    slug: "surf-apprendre-a-se-relever",
    statut: "Publié",
    category: "Surf",
    image: "/banqueimage/surf/surf_006.jpg",
    href: "/sejours/my-creative-surf-camp",
    sortOrder: 1,
    excerptHtml:
      "<p>Entre technique, confiance et océan, le surf transforme les ados autrement qu'aucun autre sport.</p>",
    contentHtml:
      "<p>Article éditable depuis le dashboard. Ajoute ici ton contenu long format.</p>",
  },
  {
    id: "home-blog-2",
    titre: "Ce qu'on entend par pédagogie de l'émancipation",
    saison: "Été 2026",
    slug: "pedagogie-emancipation-colocrew",
    statut: "Publié",
    category: "Vie collective",
    image: "/banqueimage/groupes/groupes_082.jpg",
    href: "/qui-sommes-nous",
    sortOrder: 2,
    excerptHtml:
      "<p>Choisir ses repas, organiser sa journée, proposer des activités : chez ColoCrew, les ados décident.</p>",
    contentHtml:
      "<p>Article éditable depuis le dashboard. Ajoute ici ton contenu long format.</p>",
  },
  {
    id: "home-blog-3",
    titre: "5 questions avant d'inscrire son ado en séjour sportif",
    saison: "Été 2026",
    slug: "questions-avant-sejour-sportif",
    statut: "Publié",
    category: "Famille",
    image: "/banqueimage/surf/surf_005.jpg",
    href: "/sejours",
    sortOrder: 3,
    excerptHtml:
      "<p>Budget, encadrement, programme : tout ce qu'il faut vérifier pour un été réussi.</p>",
    contentHtml:
      "<p>Article éditable depuis le dashboard. Ajoute ici ton contenu long format.</p>",
  },
];

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function Blog() {
  const [openModal, setOpenModal] = useState(false);
  const [openPicker, setOpenPicker] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      let snap = await getDocs(collection(db, DASHBOARD_COLLECTIONS.BLOG));
      if (snap.empty) {
        await Promise.all(
          DEFAULT_BLOG_SEED.map((item) =>
            setDoc(doc(db, DASHBOARD_COLLECTIONS.BLOG, item.id), {
              ...item,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          ),
        );
        snap = await getDocs(collection(db, DASHBOARD_COLLECTIONS.BLOG));
      }

      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aOrder = Number(a.sortOrder ?? 9999);
          const bOrder = Number(b.sortOrder ?? 9999);
          if (aOrder !== bOrder) return aOrder - bOrder;
          return String(a.titre || "").localeCompare(String(b.titre || ""), "fr", { sensitivity: "base" });
        });
      setItems(rows);
    } catch {
      showToast("Erreur de chargement du blog Firebase", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpenModal(true);
  };

  const onEdit = (row) => {
    setEditingId(row.id);
    setForm({
      titre: row.titre || "",
      saison: row.saison || "",
      slug: row.slug || "",
      statut: row.statut || "Publié",
      category: row.category || "",
      image: row.image || "",
      href: row.href || "",
      sortOrder: Number(row.sortOrder ?? 100),
      excerptHtml: row.excerptHtml || "",
      contentHtml: row.contentHtml || "",
    });
    setOpenModal(true);
  };

  const onCreateOrUpdate = async () => {
    if (!form.titre.trim()) {
      showToast("Titre requis", "warning");
      return;
    }
    const payload = {
      ...form,
      slug: form.slug?.trim() ? slugify(form.slug) : slugify(form.titre),
      sortOrder: Number(form.sortOrder || 100),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, DASHBOARD_COLLECTIONS.BLOG, editingId), payload);
      } else {
        await addDoc(collection(db, DASHBOARD_COLLECTIONS.BLOG), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setOpenModal(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
      showToast(editingId ? "Article modifié" : "Article créé", "success");
    } catch {
      showToast("Erreur de sauvegarde de l'article", "error");
    }
  };

  const onDelete = async (row) => {
    if (!window.confirm(`Supprimer "${row.titre || "cet article"}" ?`)) return;
    try {
      await deleteDoc(doc(db, DASHBOARD_COLLECTIONS.BLOG, row.id));
      await load();
      showToast("Article supprimé", "success");
    } catch {
      showToast("Erreur de suppression", "error");
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
      showToast(`Statut: ${next}`, "success");
    } catch {
      showToast("Erreur de mise à jour du statut", "error");
    }
  };

  const columns = useMemo(
    () => [
      { key: "sortOrder", label: "#" },
      { key: "titre", label: "Titre" },
      { key: "category", label: "Catégorie" },
      { key: "saison", label: "Saison" },
      {
        key: "statut",
        label: "Statut",
        filterable: true,
        filterLabel: "Tous les statuts",
        render: (row) => (
          <Badge
            label={row.statut || "Brouillon"}
            variant={row.statut === "Publié" ? "success" : "warning"}
          />
        ),
      },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <div className="dash-row-actions">
            <button
              type="button"
              className="dash-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleStatut(row);
              }}
            >
              {row.statut === "Publié" ? "Dépublier" : "Publier"}
            </button>
            <button
              type="button"
              className="dash-btn dash-btn-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row);
              }}
            >
              Suppr.
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
          <h1>Blog (Firebase)</h1>
          <p>Les 3 cartes de la homepage viennent de ces articles publiés.</p>
        </div>
        <div className="dash-row-actions">
          <button type="button" className="dash-btn" onClick={load}>
            Actualiser
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={openCreate}>
            Nouvel article
          </button>
        </div>
      </header>

      {loading ? (
        <p className="dash-muted">Chargement...</p>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          searchableKeys={["titre", "saison", "slug", "statut", "category"]}
          defaultSortKey="sortOrder"
          onRowClick={onEdit}
        />
      )}

      <Modal
        isOpen={openModal}
        onClose={() => {
          setOpenModal(false);
          setEditingId(null);
        }}
        title={editingId ? "Modifier l'article" : "Nouvel article"}
        size="lg"
      >
        <div className="dash-form-grid">
          <label>
            Titre
            <input
              className="dash-input"
              value={form.titre}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setForm((p) => ({
                  ...p,
                  titre: nextTitle,
                  slug: p.slug ? p.slug : slugify(nextTitle),
                }));
              }}
            />
          </label>
          <label>
            Saison
            <input
              className="dash-input"
              value={form.saison}
              onChange={(e) => setForm((p) => ({ ...p, saison: e.target.value }))}
            />
          </label>
          <label>
            Slug
            <input
              className="dash-input"
              value={form.slug}
              onChange={(e) => setForm((p) => ({ ...p, slug: slugify(e.target.value) }))}
            />
          </label>
          <label>
            Catégorie
            <input
              className="dash-input"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            />
          </label>
          <label>
            Position homepage
            <input
              type="number"
              className="dash-input"
              value={form.sortOrder}
              onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
            />
          </label>
          <label>
            Statut
            <select
              className="dash-input"
              value={form.statut}
              onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value }))}
            >
              <option>Publié</option>
              <option>Brouillon</option>
            </select>
          </label>
          <label className="dash-span-2">
            Lien article
            <input
              className="dash-input"
              value={form.href}
              onChange={(e) => setForm((p) => ({ ...p, href: e.target.value }))}
              placeholder="/sejours ou /blog/slug"
            />
          </label>
          <label className="dash-span-2">
            Image couverture
            <div className="dash-copy-field">
              <input
                className="dash-input"
                value={form.image}
                onChange={(e) => setForm((p) => ({ ...p, image: e.target.value }))}
                placeholder="/banqueimage/..."
              />
              <button type="button" className="dash-btn" onClick={() => setOpenPicker(true)}>
                Galerie
              </button>
            </div>
            {form.image ? (
              <div style={{ marginTop: 8, borderRadius: 10, overflow: "hidden", maxWidth: 300 }}>
                <img src={form.image} alt="Aperçu" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }} />
              </div>
            ) : null}
          </label>
        </div>

        <label className="dash-field-col" style={{ marginTop: 12 }}>
          Extrait (homepage)
          <WysiwygEditor
            value={form.excerptHtml}
            onChange={(html) => setForm((p) => ({ ...p, excerptHtml: html }))}
            minHeight={150}
          />
          <span className="dash-muted" style={{ fontSize: 12 }}>
            Aperçu texte: {stripHtml(form.excerptHtml).slice(0, 120) || "Aucun extrait"}
          </span>
        </label>

        <label className="dash-field-col" style={{ marginTop: 12 }}>
          Contenu article complet
          <WysiwygEditor
            value={form.contentHtml}
            onChange={(html) => setForm((p) => ({ ...p, contentHtml: html }))}
            minHeight={260}
          />
        </label>

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={() => setOpenModal(false)}>
            Fermer
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={onCreateOrUpdate}>
            {editingId ? "Mettre à jour" : "Enregistrer"}
          </button>
        </div>
      </Modal>

      <PhotoPicker
        isOpen={openPicker}
        onClose={() => setOpenPicker(false)}
        onSelect={(url) => {
          setForm((p) => ({ ...p, image: url }));
          setOpenPicker(false);
        }}
        title="Choisir une image de couverture"
      />
    </div>
  );
}
