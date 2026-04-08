"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import Badge from "@/src/components/dashboard/ui/Badge";
import DataTable from "@/src/components/dashboard/ui/DataTable";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { DASHBOARD_COLLECTIONS } from "@/src/lib/dashboardCollections";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const CORE_PAGE_SEED = [
  {
    id: "homepage-config-2026",
    nom: "Homepage 2026 - configuration",
    path: "/",
    heroImage: "/video.mp4",
    useFirebaseBody: false,
    data: {
      text: {},
      media: {},
      trips: [],
      testimonials: [],
      blogArticles: [],
      galeriePhotos: [],
    },
  },
  {
    id: "blog-index",
    nom: "Blog",
    path: "/blog",
    heroImage: "",
    subtitle: "",
    useFirebaseBody: false,
    data: {
      featuredArticleId: "",
      articleIds: [],
    },
  },
  { id: "mentions-legales", nom: "Mentions légales", path: "/mentions-legales", heroImage: "", useFirebaseBody: true, data: {} },
  { id: "rgpd", nom: "RGPD", path: "/rgpd", heroImage: "", useFirebaseBody: true, data: {} },
  {
    id: "conditions-generales-de-ventes",
    nom: "Conditions générales de vente",
    path: "/conditions-generales-de-ventes",
    heroImage: "",
    useFirebaseBody: true,
    data: {},
  },
  { id: "qui-sommes-nous", nom: "Qui sommes-nous", path: "/qui-sommes-nous", heroImage: "", useFirebaseBody: true, data: {} },
  { id: "aide-financement", nom: "Aides & financement", path: "/aide-financement", heroImage: "", useFirebaseBody: true, data: {} },
  { id: "anims", nom: "Équipe et recrutement", path: "/anims", heroImage: "", useFirebaseBody: true, data: {} },
];

const DEFAULT_BLOG_ARTICLE_SEED = [
  {
    id: "blog-article-surf-se-relever",
    nom: "Pourquoi le surf est le meilleur sport pour apprendre à tomber (et se relever)",
    slug: "surf-apprendre-a-se-relever",
    subtitle: "Été 2026",
    heroImage: "/banqueimage/surf/surf_006.jpg",
    data: {
      category: "Surf",
      excerpt:
        "Entre technique, confiance et océan, le surf transforme les ados autrement qu'aucun autre sport.",
    },
    body: "<p>Article éditable depuis le dashboard.</p>",
  },
  {
    id: "blog-article-pedagogie-emancipation",
    nom: "Ce qu'on entend par pédagogie de l'émancipation",
    slug: "pedagogie-emancipation-colocrew",
    subtitle: "Été 2026",
    heroImage: "/banqueimage/groupes/groupes_082.jpg",
    data: {
      category: "Vie collective",
      excerpt:
        "Choisir ses repas, organiser sa journée, proposer des activités : chez ColoCrew, les ados décident.",
    },
    body: "<p>Article éditable depuis le dashboard.</p>",
  },
  {
    id: "blog-article-questions-sejour-sportif",
    nom: "5 questions avant d'inscrire son ado en séjour sportif",
    slug: "questions-avant-sejour-sportif",
    subtitle: "Été 2026",
    heroImage: "/banqueimage/surf/surf_005.jpg",
    data: {
      category: "Famille",
      excerpt:
        "Budget, encadrement, programme : tout ce qu'il faut vérifier pour un été réussi.",
    },
    body: "<p>Article éditable depuis le dashboard.</p>",
  },
];

function tsToMs(value) {
  if (value?.toMillis) return value.toMillis();
  return 0;
}

function normalizePath(path) {
  if (!path) return "/";
  let next = String(path).trim();
  if (!next) return "/";
  if (!next.startsWith("/")) next = `/${next}`;
  if (next.length > 1) next = next.replace(/\/+$/, "");
  return next.toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function classifyPage(path) {
  const p = normalizePath(path);
  if (p === "/blog") return "Blog";
  if (p === "/") return "Accueil";
  return "Page";
}

function statusToPublished(status) {
  const s = String(status || "published").toLowerCase();
  return s.includes("publ");
}

export default function Pages() {
  const { showToast } = useToast();
  const router = useRouter();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  const rows = useMemo(() => {
    return [...pages].sort((a, b) => {
      const aPath = normalizePath(a.path);
      const bPath = normalizePath(b.path);
      if (aPath === "/" && bPath !== "/") return -1;
      if (bPath === "/" && aPath !== "/") return 1;
      return aPath.localeCompare(bPath, "fr");
    });
  }, [pages]);

  const blogConfigPage = useMemo(
    () => rows.find((row) => normalizePath(row.path) === "/blog") || null,
    [rows],
  );

  const tableRows = useMemo(
    () => rows.filter((row) => normalizePath(row.path) !== "/blog"),
    [rows],
  );

  const columns = useMemo(
    () => [
      { key: "nom", label: "Page" },
      { key: "path", label: "Chemin" },
      {
        key: "kind",
        label: "Type",
        filterable: true,
        filterLabel: "Tous les types",
        render: (row) => {
          const kind = classifyPage(row.path);
          const variant =
            kind === "Accueil" ? "success" : kind === "Blog" ? "info" : "neutral";
          return <Badge label={kind} variant={variant} />;
        },
      },
      {
        key: "firebase",
        label: "Source",
        render: () => (
          <div className="dash-row-actions">
            <Badge label="Firebase live" variant="success" />
          </div>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <div className="dash-row-actions">
            <Link
              href={`/dashboard/pages/${row.id}`}
              className="dash-btn"
              onClick={(e) => e.stopPropagation()}
            >
              Éditer
            </Link>
            <button
              type="button"
              className="dash-btn dash-btn-danger"
              onClick={async (e) => {
                e.stopPropagation();
                showToast(
                  "Attention : la suppression est définitive et impacte la page en ligne.",
                  "warning",
                );
                const ok = window.confirm(
                  `Supprimer définitivement la page \"${row.nom || row.path}\" ?`,
                );
                if (!ok) return;
                try {
                  await deleteDoc(doc(db, COLLECTIONS.PAGES, row.id));
                  setPages((prev) => prev.filter((item) => item.id !== row.id));
                  showToast("Page supprimée", "success");
                } catch {
                  showToast("Suppression impossible", "error");
                }
              }}
            >
              Supprimer
            </button>
          </div>
        ),
      },
    ],
    [showToast],
  );

  const migrateDraftPagesIfNeeded = async () => {
    const liveSnap = await getDocs(collection(db, COLLECTIONS.PAGES));
    if (!liveSnap.empty) return false;

    const legacySnap = await getDocs(collection(db, DASHBOARD_COLLECTIONS.PAGES));
    if (legacySnap.empty) return false;

    for (const item of legacySnap.docs) {
      const data = item.data();
      await setDoc(
        doc(db, COLLECTIONS.PAGES, item.id),
        {
          ...data,
          path: normalizePath(data.path || "/"),
          status: "published",
          useFirebaseBody: false,
          migratedFromDraft: true,
          migratedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
    return true;
  };

  const ensureCorePages = async () => {
    const snap = await getDocs(collection(db, COLLECTIONS.PAGES));
    const docs = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

    const byPath = new Map(
      docs.map((item) => [normalizePath(item.path || "/"), item]).filter(([path]) => path),
    );

    let changed = false;

    for (const seed of CORE_PAGE_SEED) {
      const key = normalizePath(seed.path);
      if (byPath.has(key)) continue;

      await setDoc(
        doc(db, COLLECTIONS.PAGES, seed.id),
        {
          ...seed,
          path: key,
          body:
            key === "/"
              ? ""
              : key === "/blog"
                ? ""
                : `<h2>${seed.nom}</h2><p>Contenu éditable depuis Firebase.</p>`,
          status: "published",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      changed = true;
    }

    return changed;
  };

  const ensureBlogPages = async () => {
    const snap = await getDocs(collection(db, COLLECTIONS.PAGES));
    const docs = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

    const hasBlogPages = docs.some((item) => {
      const path = normalizePath(item.path || "");
      return path !== "/" && path !== "/blog";
    });

    if (hasBlogPages) return false;

    for (const seed of DEFAULT_BLOG_ARTICLE_SEED) {
      const path = `/${seed.slug}`;
      await setDoc(
        doc(db, COLLECTIONS.PAGES, seed.id),
        {
          ...seed,
          path,
          useFirebaseBody: true,
          status: "published",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    const blogConfig = docs.find((item) => normalizePath(item.path || "") === "/blog");
    if (blogConfig) {
      await setDoc(
        doc(db, COLLECTIONS.PAGES, blogConfig.id),
        {
          data: {
            ...(blogConfig.data || {}),
            featuredPageId: DEFAULT_BLOG_ARTICLE_SEED[0].id,
            pageIds: DEFAULT_BLOG_ARTICLE_SEED.map((item) => item.id),
            featuredArticleId: DEFAULT_BLOG_ARTICLE_SEED[0].id,
            articleIds: DEFAULT_BLOG_ARTICLE_SEED.map((item) => item.id),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    return true;
  };

  const migrateLegacyBlogIfNeeded = async () => {
    const pagesSnap = await getDocs(collection(db, COLLECTIONS.PAGES));
    const pages = pagesSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    const hasBlogPages = pages.some((item) => {
      const path = normalizePath(item.path || "");
      return path !== "/" && path !== "/blog";
    });
    if (hasBlogPages) return false;

    const legacySnap = await getDocs(collection(db, DASHBOARD_COLLECTIONS.BLOG));
    if (legacySnap.empty) return false;

    const publishedLegacy = legacySnap.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .filter((item) => statusToPublished(item?.statut));

    if (!publishedLegacy.length) return false;

    const articleIds = [];

    for (const item of publishedLegacy) {
      const slug = slugify(item.slug || item.titre || item.id || "article");
      const articleId = `blog-${item.id}`;
      articleIds.push(articleId);

      await setDoc(
        doc(db, COLLECTIONS.PAGES, articleId),
        {
          nom: String(item.titre || "Article"),
          subtitle: String(item.saison || ""),
          path: `/${slug}`,
          slug,
          heroImage: String(item.image || ""),
          body: String(item.contentHtml || item.excerptHtml || ""),
          useFirebaseBody: true,
          status: statusToPublished(item.statut) ? "published" : "draft",
          data: {
            category: String(item.category || "Blog"),
            excerpt: String(item.excerptHtml || ""),
            legacyId: item.id,
            sortOrder: Number(item.sortOrder || 999),
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    const blogPage = pages.find((item) => normalizePath(item.path || "") === "/blog");
    if (blogPage) {
      await setDoc(
        doc(db, COLLECTIONS.PAGES, blogPage.id),
        {
          data: {
            ...(blogPage.data || {}),
            featuredPageId: articleIds[0] || "",
            pageIds: articleIds,
            featuredArticleId: articleIds[0] || "",
            articleIds,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    return true;
  };

  const migrateBlogPathsToRoot = async () => {
    const snap = await getDocs(collection(db, COLLECTIONS.PAGES));
    const docs = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    const updates = [];

    for (const item of docs) {
      const currentPath = normalizePath(item.path || "");
      const isLegacyBlogPath = currentPath.startsWith("/blog/") && currentPath !== "/blog";
      if (!isLegacyBlogPath) continue;

      const baseSlug = slugify(
        item.slug ||
          (currentPath.startsWith("/blog/") ? currentPath.replace(/^\/blog\//, "") : "") ||
          item.nom ||
          item.id,
      );
      if (!baseSlug) continue;

      const nextPath = `/${baseSlug}`;
      if (currentPath === nextPath && String(item.slug || "") === baseSlug) continue;

      updates.push(
        updateDoc(doc(db, COLLECTIONS.PAGES, item.id), {
          path: nextPath,
          slug: baseSlug,
          updatedAt: serverTimestamp(),
        }),
      );
    }

    if (!updates.length) return 0;
    await Promise.all(updates);
    return updates.length;
  };

  const loadPages = async () => {
    setLoading(true);
    try {
      const normalizedBlogPaths = await migrateBlogPathsToRoot();
      const migratedPages = await migrateDraftPagesIfNeeded();
      const seededCore = await ensureCorePages();
      const migratedLegacyBlog = await migrateLegacyBlogIfNeeded();
      const seededBlogPages = !migratedLegacyBlog ? await ensureBlogPages() : false;

      if (normalizedBlogPaths) {
        showToast(`${normalizedBlogPaths} URL(s) d'article migrée(s) vers la racine`, "success");
      }
      if (migratedPages) {
        showToast("Pages migrées depuis draft vers Firebase live", "success");
      }
      if (seededCore) {
        showToast("Pages principales initialisées", "success");
      }
      if (migratedLegacyBlog) {
        showToast("Anciennes pages blog migrées vers des URL racine", "success");
      } else if (seededBlogPages) {
        showToast("Pages de base initialisées", "success");
      }

      const snap = await getDocs(collection(db, COLLECTIONS.PAGES));
      const raw = snap.docs.map((item) => ({ id: item.id, ...item.data() }));

      const grouped = raw.reduce((acc, row) => {
        const key = normalizePath(row.path || "/");
        if (!acc[key]) acc[key] = [];
        acc[key].push({ ...row, path: key });
        return acc;
      }, {});

      const kept = [];
      const toDelete = [];

      Object.values(grouped).forEach((group) => {
        const sorted = [...group].sort((a, b) => {
          const byUpdated = tsToMs(b.updatedAt) - tsToMs(a.updatedAt);
          if (byUpdated !== 0) return byUpdated;
          return tsToMs(b.createdAt) - tsToMs(a.createdAt);
        });
        kept.push(sorted[0]);
        toDelete.push(...sorted.slice(1));
      });

      if (toDelete.length) {
        await Promise.all(
          toDelete.map((item) => deleteDoc(doc(db, COLLECTIONS.PAGES, item.id))),
        );
        showToast(`${toDelete.length} doublon(s) supprimé(s)`, "success");
      }

      setPages(kept);
    } catch {
      showToast("Erreur de chargement des pages", "error");
    } finally {
      setLoading(false);
    }
  };

  const createBlogArticle = async () => {
    try {
      const stamp = Date.now();
      const slug = `nouvelle-page-${stamp}`;
      const articleId = `page-${stamp}`;
      await setDoc(doc(db, COLLECTIONS.PAGES, articleId), {
        nom: "Nouvelle page",
        subtitle: "",
        eyebrow: "",
        path: `/${slug}`,
        slug,
        heroImage: "",
        body: "<p>Contenu de la page...</p>",
        useFirebaseBody: true,
        status: "draft",
        data: {
          category: "",
          excerpt: "",
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("Nouvelle page créée", "success");
      router.push(`/dashboard/pages/${articleId}`);
    } catch {
      showToast("Impossible de créer la page", "error");
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Pages du site (Firebase live)</h1>
          <p>Tous les contenus éditoriaux (pages et blog) sont gérés ici.</p>
        </div>
        <div className="dash-row-actions">
          <button type="button" className="dash-btn" onClick={loadPages}>
            Actualiser
          </button>
          {blogConfigPage ? (
            <Link href={`/dashboard/pages/${blogConfigPage.id}`} className="dash-btn">
              Configurer le blog
            </Link>
          ) : null}
          <button type="button" className="dash-btn dash-btn-primary" onClick={createBlogArticle}>
            Nouvelle page
          </button>
        </div>
      </header>

      <aside className="dash-info-box">
        Le blog affiche des pages publiées. Chaque page conserve une URL racine de type <code>/mon-article</code>.
      </aside>

      <section className="dash-homepage-editor-section">
        <h3>Liste des contenus éditoriaux</h3>
        {loading ? (
          <p className="dash-muted">Chargement...</p>
        ) : (
          <DataTable
            columns={columns}
            data={tableRows.map((row) => ({ ...row, kind: classifyPage(row.path) }))}
            searchableKeys={["nom", "path"]}
            defaultSortKey="path"
            onRowClick={(row) => router.push(`/dashboard/pages/${row.id}`)}
          />
        )}
      </section>
    </div>
  );
}
