"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import WysiwygEditor from "@/src/components/dashboard/ui/WysiwygEditor";
      
import PhotoPicker from "@/src/components/dashboard/ui/PhotoPicker";
import Modal from "@/src/components/dashboard/ui/Modal";
import Badge from "@/src/components/dashboard/ui/Badge";
import { useToast } from "@/src/contexts/ToastContext";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

/* ─── Text field groups for homepage ────────────────────────────────── */
const TEXT_GROUPS = [
  {
    id: "hero-texts",
    label: "Héros & Accroche",
    fields: [
      ["heroTitle", "Titre principal", "input"],
      ["heroSubtitle", "Sous-titre", "input"],
      ["heroQuote", "Citation du hero", "textarea"],
      ["heroQuoteSource", "Source de la citation", "input"],
      ["tagline", "Tagline", "input"],
      ["cta", "Texte CTA principal", "input"],
    ],
  },
  {
    id: "editorial-texts",
    label: "Contenu éditorial",
    fields: [
      ["editorialTitle", "Titre bloc 'ColoCrew'", "input"],
      ["editorialText", "Texte bloc ColoCrew", "textarea"],
      ["sejoursSummaryText", "Résumé des séjours", "textarea"],
      ["reservationLink", "Texte lien réservation", "input"],
      ["reservationTitle", "Titre section réservation", "input"],
      ["reservationText", "Texte section réservation", "textarea"],
    ],
  },
  {
    id: "social-texts",
    label: "Réseaux, Aides & Partenaires",
    fields: [
      ["socialTitle", "Titre réseaux sociaux", "input"],
      ["socialText", "Texte réseaux sociaux", "textarea"],
      ["aidesTitle", "Titre section aides", "input"],
      ["aidesText", "Texte section aides", "textarea"],
      ["workTitle", "Titre 'Travailler avec nous'", "input"],
      ["workText", "Texte 'Travailler avec nous'", "textarea"],
      ["partnersTitle", "Titre partenaires", "input"],
    ],
  },
];

/* ─── Defaults ───────────────────────────────────────────────────────── */
const DEFAULT_HOME = {
  text: {},
  trips: [],
  blogArticles: [],
  testimonials: [],
  testimonialsCount: 6,
  galeriePhotos: [],
  media: { heroSrc: "/video.mp4", heroPoster: "/load.png", streamPortraitImage: "", streamAmbianceImage: "" },
};

const DEFAULT_HOME_GALLERY_FALLBACK = [
  "/banqueimage/groupes/groupes_080.jpeg",
  "/banqueimage/groupes/groupes_008.jpeg",
  "/banqueimage/groupes/groupes_064.jpeg",
  "/banqueimage/groupes/groupes_016.jpeg",
  "/banqueimage/groupes/groupes_101.jpg",
  "/banqueimage/groupes/groupes_041.jpeg",
];

function normalizeHome(data) {
  return {
    ...DEFAULT_HOME,
    ...data,
    text: { ...DEFAULT_HOME.text, ...(data?.text || {}) },
    trips: Array.isArray(data?.trips) ? data.trips : [],
    blogArticles: dedupeBlogArticles(Array.isArray(data?.blogArticles) ? data.blogArticles : []),
    testimonials: Array.isArray(data?.testimonials) ? data.testimonials : [],
    testimonialsCount: Number(data?.testimonialsCount || 6),
    galeriePhotos: Array.isArray(data?.galeriePhotos) ? data.galeriePhotos.map(normalizeGalleryEntry).filter(Boolean) : [],
    media: { ...DEFAULT_HOME.media, ...(data?.media || {}) },
  };
}

function galleryEntrySrc(value) {
  if (typeof value === "string") return String(value || "").trim();
  if (!value || typeof value !== "object") return "";
  return String(value.url || value.src || value.image || "").trim();
}

function normalizeGalleryEntry(value) {
  if (typeof value === "string") {
    const src = String(value || "").trim();
    return src || null;
  }
  if (!value || typeof value !== "object") return null;
  const src = galleryEntrySrc(value);
  if (!src) return null;
  return {
    photoId: String(value.photoId || value.id || "").trim() || undefined,
    url: src,
    storagePath: String(value.storagePath || "").trim() || undefined,
    album: String(value.album || "").trim() || undefined,
    nom: String(value.nom || "").trim() || undefined,
  };
}

function dedupeHomeGallery(list) {
  const seen = new Set();
  const output = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const normalized = normalizeGalleryEntry(item);
    if (!normalized) return;
    const src = galleryEntrySrc(normalized);
    if (!src || seen.has(src)) return;
    seen.add(src);
    output.push(normalized);
  });
  return output;
}

function normalizePath(path) {
  if (!path) return "/";
  let next = String(path).trim();
  if (!next.startsWith("/")) next = `/${next}`;
  if (next.length > 1) next = next.replace(/\/+$/, "");
  return next.toLowerCase();
}

function isVideo(src) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(src || ""));
}

function pickAuthor(r) {
  return r?.identite || r?.parentName || r?.respondentName || r?.childName || "Anonyme";
}

function pickFullText(r) {
  const first = String(r?.retourQualitatif || "").trim();
  if (first) return first;

  const comments = Array.isArray(r?.comments)
    ? r.comments.map((entry) => String(entry?.text || "").trim()).filter(Boolean)
    : [];
  if (comments.length) return comments.join("\n\n");

  const highlights = Array.isArray(r?.highlights)
    ? r.highlights.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  return highlights.join("\n\n");
}

function toExcerpt(text, max = 220) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractBodyImageSources(html) {
  const source = String(html || "");
  const regex = /<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi;
  const output = [];
  let match = regex.exec(source);
  while (match) {
    output.push(String(match[2] || "").trim());
    match = regex.exec(source);
  }
  return output;
}

function replaceBodyImageAtIndex(html, index, nextSrc) {
  const source = String(html || "");
  const target = String(nextSrc || "").trim();
  if (!source || !target || index < 0) return source;

  let current = -1;
  return source.replace(
    /<img\b([^>]*?)\bsrc=(["'])(.*?)\2([^>]*)>/gi,
    (full, before, quote, _old, after) => {
      current += 1;
      if (current !== index) return full;
      return `<img${before}src=${quote}${escapeHtml(target)}${quote}${after}>`;
    },
  );
}

function normalizeTestimonialType(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("jeune") || raw.includes("enfant")) return "Jeune";
  return "Parent";
}

function toTestimonialEditForm(retour, fallback = {}) {
  const fullText = pickFullText(retour) || String(fallback.fullText || fallback.excerpt || "");
  const type = normalizeTestimonialType(retour?.type || retour?.respondentType || fallback.type);
  return {
    retourId: String(retour?.id || fallback.retourId || "").trim(),
    identite: String(pickAuthor(retour) || fallback.displayName || fallback.name || "").trim(),
    type,
    sejour: String(retour?.sejour || fallback.period || "").trim(),
    date: String(retour?.date || "").trim(),
    note: Number(retour?.note || fallback.note || 10) || 10,
    retourQualitatif: fullText,
    photoUrl: String(retour?.photoUrl || fallback.avatar || fallback.sourceAvatar || "").trim(),
    photoPath: String(retour?.photoPath || "").trim(),
  };
}

function toHomepageTestimonialFromForm(form, existing = {}) {
  const fullText = String(form?.retourQualitatif || "").trim();
  const merged = {
    ...existing,
    retourId: String(form?.retourId || existing?.retourId || "").trim(),
    displayName: String(form?.identite || existing?.displayName || existing?.name || "Anonyme").trim(),
    name: String(form?.identite || existing?.name || existing?.displayName || "Anonyme").trim(),
    type: normalizeTestimonialType(form?.type || existing?.type),
    period: String(form?.sejour || existing?.period || "").trim(),
    fullText,
    excerpt: toExcerpt(fullText),
    sourceAvatar: String(form?.photoUrl || existing?.sourceAvatar || "").trim(),
    note: Number(form?.note || existing?.note || 10) || 10,
  };
  if (!String(merged.avatar || "").trim()) {
    merged.avatar = String(form?.photoUrl || "").trim();
  }
  return merged;
}

function fmtSejourAge(s) {
  const g = Array.isArray(s?.ageGroups) ? s.ageGroups : [];
  if (g.length) return g.join(" / ");
  if (s?.ageMin && s?.ageMax) return `${s.ageMin}-${s.ageMax} ans`;
  return "";
}

function normalizeFilename(name) {
  const safe = String(name || "image").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9._-]/g, "");
  const dot = safe.lastIndexOf(".");
  if (dot <= 0) return `${safe || "image"}.jpg`;
  return `${safe.slice(0, dot) || "image"}.${safe.slice(dot + 1) || "jpg"}`;
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

const DEFAULT_BLOG_PAGE_DATA = {
  featuredPageId: "",
  pageIds: [],
};

function normalizeBlogPageData(data) {
  const ids = Array.isArray(data?.pageIds)
    ? data.pageIds
    : Array.isArray(data?.articleIds)
      ? data.articleIds
      : [];
  const featured = String(data?.featuredPageId || data?.featuredArticleId || "").trim();
  return {
    ...DEFAULT_BLOG_PAGE_DATA,
    ...(data && typeof data === "object" ? data : {}),
    featuredPageId: featured,
    featuredArticleId: featured,
    pageIds: ids.map((value) => String(value || "").trim()).filter(Boolean),
    articleIds: ids.map((value) => String(value || "").trim()).filter(Boolean),
  };
}

function normalizeBlogArticle(item) {
  if (!item || typeof item !== "object") return null;
  const path = normalizePath(item.path || "");
  const articleId = String(item.articleId || item.id || "").trim();
  const title = String(item.titre || item.title || item.nom || "").trim();
  const category = String(item.category || item.data?.category || "Blog").trim() || "Blog";
  const image = String(item.image || item.heroImage || item.data?.coverImage || "").trim();
  const excerpt = stripHtml(
    item.excerptHtml ||
      item.excerpt ||
      item.data?.excerpt ||
      item.data?.excerptHtml ||
      item.body ||
      "",
  );
  const slugFromPath = path.startsWith("/blog/")
    ? path.replace(/^\/blog\//, "")
    : path.replace(/^\//, "");
  const rawHref = String(item.href || "").trim();
  const hrefCandidate =
    rawHref ||
    (path && path !== "/" ? path : slugFromPath ? `/${slugFromPath}` : "/blog");
  const normalizedHref = normalizePath(hrefCandidate);
  const href = normalizedHref.startsWith("/blog/")
    ? `/${normalizedHref.replace(/^\/blog\//, "")}`
    : normalizedHref;
  const slug = slugify(String(item.slug || slugFromPath || href.replace(/^\//, "") || title));
  if (!title) return null;

  return {
    articleId,
    title,
    category,
    image,
    excerpt,
    href,
    slug,
  };
}

function dedupeBlogArticles(list) {
  const output = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((item) => {
    const normalized = normalizeBlogArticle(item);
    if (!normalized) return;
    const key =
      normalized.articleId ||
      normalized.slug ||
      normalized.href ||
      normalized.title.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

/* ─── Accordion section wrapper ─────────────────────────────────────── */
function AccSection({ id, label, icon, badge, isOpen, onToggle, children, color = "#f0ebf8" }) {
  return (
    <div className="dash-accordion-item">
      <button type="button" className="dash-accordion-header" onClick={() => onToggle(id)}>
        {icon && (
          <span className="dash-accordion-header-icon" style={{ background: color, color: "var(--dash-accent)" }}>
            {icon}
          </span>
        )}
        <span className="dash-accordion-header-title">{label}</span>
        {badge != null && (
          <span className="dash-accordion-header-count">{badge}</span>
        )}
        <svg
          className={`dash-accordion-chevron ${isOpen ? "is-open" : ""}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          strokeWidth="2" strokeLinecap="round" stroke="currentColor"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && <div className="dash-accordion-body" style={{ paddingTop: 14 }}>{children}</div>}
    </div>
  );
}

/* ─── Tiny icon SVGs ─────────────────────────────────────────────────── */
function Ico({ d, d2 }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d={d} />{d2 && <path d={d2} />}
    </svg>
  );
}

/* ─── PhotoField — champ image avec aperçu + boutons ────────────────── */
function PhotoField({ label, value, onChange, onPickerOpen, uploading, accept = "image/*", onFileUpload }) {
  return (
    <div className="dash-field-col">
      {label && <label style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>}
      <div className="dash-copy-field">
        <input className="dash-input" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="/public/... ou https://..." />
        <button type="button" className="dash-btn" onClick={onPickerOpen} title="Choisir dans la bibliothèque">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5-4 4-2-2-4 4"/></svg>
          Galerie
        </button>
      </div>
      {onFileUpload && (
        <label className="dash-btn" style={{ cursor: "pointer", justifyContent: "center", fontSize: 12, height: 32 }}>
          {uploading ? "Upload…" : "⬆ Upload fichier"}
          <input type="file" accept={accept} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFileUpload(f); e.target.value = ""; } }} />
        </label>
      )}
      {value && !isVideo(value) && (
        <div style={{ marginTop: 6, borderRadius: 10, overflow: "hidden", maxWidth: 320, boxShadow: "var(--dash-shadow)" }}>
          <img src={value} alt="Aperçu" style={{ width: "100%", display: "block", maxHeight: 180, objectFit: "cover" }} />
        </div>
      )}
      {value && isVideo(value) && (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--dash-muted)", background: "#f0ebf8", borderRadius: 8, padding: "6px 10px" }}>
          🎬 Vidéo : {value}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */
export default function PageEditor({ pageId }) {
  const { showToast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [docExists, setDocExists] = useState(true);

  const [sejours, setSejours] = useState([]);
  const [retours, setRetours] = useState([]);
  const [blogItems, setBlogItems] = useState([]);
  const [photosLibrary, setPhotosLibrary] = useState([]);
  const [featuredSejours, setFeaturedSejours] = useState(["", ""]);
  const [retourToAdd, setRetourToAdd] = useState("");
  const [blogToAdd, setBlogToAdd] = useState("");

  const [pageMeta, setPageMeta] = useState({
    nom: "",
    path: "",
    heroImage: "",
    body: "",
    status: "published",
    useFirebaseBody: false,
  });
  const [homeData, setHomeData] = useState(DEFAULT_HOME);
  const [isHomePage, setIsHomePage] = useState(false);
  const [isBlogPage, setIsBlogPage] = useState(false);
  const [isBlogArticle, setIsBlogArticle] = useState(false);
  const [blogPageData, setBlogPageData] = useState(DEFAULT_BLOG_PAGE_DATA);
  const [pageBodyMode, setPageBodyMode] = useState("html");
  const [pageImageCaption, setPageImageCaption] = useState("");

  // Accordion
  const [openSections, setOpenSections] = useState(new Set(["meta"]));
  const toggle = (id) => setOpenSections((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Photo picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [uploading, setUploading] = useState("");
  const [testimonialEditorOpen, setTestimonialEditorOpen] = useState(false);
  const [testimonialEditorSaving, setTestimonialEditorSaving] = useState(false);
  const [testimonialEditorIndex, setTestimonialEditorIndex] = useState(-1);
  const [testimonialEditorData, setTestimonialEditorData] = useState(() =>
    toTestimonialEditForm(null, {}),
  );

  const photosByUrl = useMemo(() => {
    const map = new Map();
    photosLibrary.forEach((item) => {
      const src = String(item?.url || "").trim();
      if (!src) return;
      map.set(src, item);
    });
    return map;
  }, [photosLibrary]);

  const pageBodyImages = useMemo(
    () => extractBodyImageSources(pageMeta.body),
    [pageMeta.body],
  );

  const toHomeGalleryEntryFromUrl = (url) => {
    const src = String(url || "").trim();
    if (!src) return null;
    const match = photosByUrl.get(src);
    if (!match) return src;
    return {
      photoId: match.id,
      url: src,
      storagePath: match.storagePath || "",
      album: match.album || "",
      nom: match.nom || "",
    };
  };

  const openPicker = (target) => { setPickerTarget(target); setPickerOpen(true); };

  const appendToPageBody = (htmlSnippet) => {
    const snippet = String(htmlSnippet || "").trim();
    if (!snippet) return;
    setPageMeta((prev) => {
      const current = String(prev.body || "").trim();
      return {
        ...prev,
        body: current ? `${current}\n\n${snippet}` : snippet,
      };
    });
  };

  const replaceBodyImage = (imageIndex, nextSrc) => {
    setPageMeta((prev) => ({
      ...prev,
      body: replaceBodyImageAtIndex(prev.body, imageIndex, nextSrc),
    }));
  };

  const syncRetourPhoto = async (retourId, photoUrl, photoPath = "") => {
    const targetId = String(retourId || "").trim();
    if (!targetId) return;
    try {
      await updateDoc(doc(db, "retours", targetId), {
        photoUrl: String(photoUrl || "").trim(),
        photoPath: String(photoPath || "").trim(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // best effort: homepage still keeps local override even if sync fails
    }
  };

  const onPhotoSelect = (url) => {
    if (!pickerTarget) return;
    const t = pickerTarget;
    if (t.scope === "pageHero") setPageMeta((p) => ({ ...p, heroImage: url }));
    else if (t.scope === "homeMedia") setHomeData((p) => ({ ...p, media: { ...p.media, [t.key]: url } }));
    else if (t.scope === "homeGalleryAdd") {
      const entry = toHomeGalleryEntryFromUrl(url);
      if (entry) setHomeData((p) => ({ ...p, galeriePhotos: dedupeHomeGallery([...(p.galeriePhotos || []), entry]) }));
    } else if (t.scope === "homeGalleryReplace") {
      const entry = toHomeGalleryEntryFromUrl(url);
      if (entry) {
        setHomeData((p) => {
          const g = [...(p.galeriePhotos || [])];
          g[t.index] = entry;
          return { ...p, galeriePhotos: dedupeHomeGallery(g) };
        });
      }
    }
    else if (t.scope === "testimonialAvatar") setHomeData((p) => { const ts = [...(p.testimonials || [])]; ts[t.index] = { ...ts[t.index], avatar: url }; return { ...p, testimonials: ts }; });
    else if (t.scope === "testimonialEditorPhoto") {
      const linked = photosByUrl.get(String(url || "").trim());
      setTestimonialEditorData((prev) => ({
        ...prev,
        photoUrl: String(url || "").trim(),
        photoPath: String(linked?.storagePath || prev.photoPath || "").trim(),
      }));
    }
    else if (t.scope === "pageBodyImage") {
      const linked = photosByUrl.get(String(url || "").trim());
      const alt = String(pageImageCaption || "").trim() || linked?.nom || "Photo";
      const side = t.side === "left" ? "is-left" : "is-right";
      appendToPageBody(
        `<figure class="article-image ${side}"><img src="${escapeHtml(url)}" alt="${escapeHtml(
          alt,
        )}" loading="lazy" /></figure>`,
      );
      setPageImageCaption("");
      setPageBodyMode("html");
    } else if (t.scope === "pageBodyImageReplace") {
      replaceBodyImage(t.index, url);
      setPageBodyMode("html");
    }
    if (t.scope === "testimonialAvatar") {
      const retourId = homeData?.testimonials?.[t.index]?.retourId || "";
      const linked = photosByUrl.get(String(url || "").trim());
      syncRetourPhoto(retourId, url, linked?.storagePath || "");
    }
    setPickerOpen(false);
  };

  /* Upload and set */
  const uploadAndSet = async (file, scope, key = "", index = -1) => {
    if (!file) return;
    const filename = normalizeFilename(file.name);
    const uploadKey = `${scope}-${key || index}`;
    setUploading(uploadKey);
    try {
      const storagePath = `banqueimage/dashboard-pages/${Date.now()}-${filename}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      // Save to Firestore photos
      let photoRefId = "";
      try {
        const photoRef = await addDoc(collection(db, COLLECTIONS.PHOTOS), {
          nom: filename, album: "dashboard-pages", url, storagePath,
          dateAjout: serverTimestamp(), taille: file.size || 0, ordre: 0,
        });
        photoRefId = photoRef.id;
      } catch { /* best effort */ }
      // Apply
      if (scope === "pageHero") setPageMeta((p) => ({ ...p, heroImage: url }));
      else if (scope === "homeMedia") setHomeData((p) => ({ ...p, media: { ...p.media, [key]: url } }));
      else if (scope === "homeGalleryAdd") {
        const entry = photoRefId
          ? { photoId: photoRefId, url, storagePath, album: "dashboard-pages", nom: filename }
          : toHomeGalleryEntryFromUrl(url);
        if (entry) {
          setHomeData((p) => ({ ...p, galeriePhotos: dedupeHomeGallery([...(p.galeriePhotos || []), entry]) }));
        }
      }
      else if (scope === "testimonialAvatar") {
        setHomeData((p) => {
          const ts = [...(p.testimonials || [])];
          ts[index] = { ...ts[index], avatar: url };
          return { ...p, testimonials: ts };
        });
        const retourId = homeData?.testimonials?.[index]?.retourId || "";
        await syncRetourPhoto(retourId, url, storagePath);
      }
      else if (scope === "testimonialEditorPhoto") {
        setTestimonialEditorData((prev) => ({
          ...prev,
          photoUrl: url,
          photoPath: storagePath,
        }));
      }
      else if (scope === "pageBodyImage") {
        const alt = String(pageImageCaption || "").trim() || filename;
        appendToPageBody(
          `<figure class="article-image is-right"><img src="${escapeHtml(url)}" alt="${escapeHtml(
            alt,
          )}" loading="lazy" /></figure>`,
        );
        setPageImageCaption("");
        setPageBodyMode("html");
      } else if (scope === "pageBodyImageReplace") {
        replaceBodyImage(index, url);
        setPageBodyMode("html");
      }
      showToast("Photo uploadée", "success");
    } catch {
      showToast("Erreur upload", "error");
    } finally {
      setUploading("");
    }
  };

  /* retour options */
  const retourOptions = useMemo(
    () =>
      retours.map((r) => {
        const fullText = pickFullText(r);
        return {
          id: r.id,
          label: `${pickAuthor(r)}${r.sejour ? ` · ${r.sejour}` : ""}`,
          data: {
            retourId: r.id,
            displayName: pickAuthor(r),
            name: pickAuthor(r),
            type: normalizeTestimonialType(r.type || r.respondentType),
            period: r.sejour || "",
            excerpt: toExcerpt(fullText),
            fullText,
            avatar: r.photoUrl || "",
            sourceAvatar: r.photoUrl || "",
            note: Number.isFinite(Number(r.note)) && Number(r.note) > 0 ? Number(r.note) : 10,
          },
        };
      }),
    [retours],
  );

  const blogArticleOptions = useMemo(
    () =>
      blogItems
        .filter((item) => String(item?.status || "published").toLowerCase() === "published")
        .sort((a, b) => {
          const aOrder = Number(a?.data?.sortOrder ?? a?.sortOrder ?? 9999);
          const bOrder = Number(b?.data?.sortOrder ?? b?.sortOrder ?? 9999);
          if (aOrder !== bOrder) return aOrder - bOrder;
          return String(a?.nom || a?.title || "").localeCompare(
            String(b?.nom || b?.title || ""),
            "fr",
            { sensitivity: "base" },
          );
        })
        .map((item) => ({
          id: item.id,
          label: item.nom || item.title || item.slug || item.id,
          data: normalizeBlogArticle(item),
        }))
        .filter((item) => item.data),
    [blogItems],
  );

  const blogOptions = blogArticleOptions;

  const addRetourToHomepage = (retourId) => {
    const selected = retourOptions.find((entry) => entry.id === retourId);
    if (!selected) return;

    setHomeData((prev) => {
      const current = Array.isArray(prev.testimonials) ? prev.testimonials : [];
      const exists = current.some((item) => {
        if (item?.retourId && selected.data.retourId) {
          return String(item.retourId) === String(selected.data.retourId);
        }
        return (
          String(item?.displayName || "") === String(selected.data.displayName || "") &&
          String(item?.fullText || item?.excerpt || "") === String(selected.data.fullText || "")
        );
      });
      if (exists) return prev;
      return { ...prev, testimonials: [...current, selected.data] };
    });
    setRetourToAdd("");
  };

  const addBlogToHomepage = (blogId) => {
    const selected = blogOptions.find((entry) => entry.id === blogId);
    if (!selected) return;

    setHomeData((prev) => {
      const current = Array.isArray(prev.blogArticles) ? prev.blogArticles : [];
      const exists = current.some((item) => String(item?.articleId || item?.id || "") === String(selected.id));
      if (exists) return prev;
      return { ...prev, blogArticles: dedupeBlogArticles([...current, selected.data]) };
    });
    setBlogToAdd("");
  };

  const addBlogArticleToBlogPage = (blogId) => {
    const targetId = String(blogId || "").trim();
    if (!targetId) return;
    setBlogPageData((prev) => {
      const current = Array.isArray(prev.pageIds) ? prev.pageIds : [];
      if (current.includes(targetId)) return prev;
      return {
        ...prev,
        pageIds: [...current, targetId],
        articleIds: [...current, targetId],
        featuredPageId: prev.featuredPageId || targetId,
        featuredArticleId: prev.featuredPageId || prev.featuredArticleId || targetId,
      };
    });
    setBlogToAdd("");
  };

  const moveBlogPageArticle = (index, direction) => {
    setBlogPageData((prev) => {
      const rows = [...(prev.pageIds || [])];
      const target = index + direction;
      if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return prev;
      const [moved] = rows.splice(index, 1);
      rows.splice(target, 0, moved);
      return { ...prev, pageIds: rows, articleIds: rows };
    });
  };

  const removeBlogPageArticle = (articleId) => {
    const targetId = String(articleId || "").trim();
    if (!targetId) return;
    setBlogPageData((prev) => {
      const nextIds = (prev.pageIds || []).filter((id) => String(id || "").trim() !== targetId);
      const nextFeatured =
        String(prev.featuredPageId || prev.featuredArticleId || "").trim() === targetId
          ? nextIds[0] || ""
          : prev.featuredPageId || prev.featuredArticleId || "";
      return {
        ...prev,
        pageIds: nextIds,
        articleIds: nextIds,
        featuredPageId: nextFeatured,
        featuredArticleId: nextFeatured,
      };
    });
  };

  const selectedBlogArticles = useMemo(() => {
    const selected = Array.isArray(homeData.blogArticles) ? homeData.blogArticles : [];
    if (!selected.length) return [];

    const blogById = new Map(
      blogItems.map((item) => [String(item.id || "").trim(), item]).filter(([id]) => id),
    );

    const merged = selected.map((entry) => {
      const articleId = String(entry?.articleId || entry?.id || "").trim();
      const source = articleId ? blogById.get(articleId) : null;
      if (source) {
        return normalizeBlogArticle({ ...source, id: source.id });
      }
      return normalizeBlogArticle(entry);
    });

    return dedupeBlogArticles(merged);
  }, [homeData.blogArticles, blogItems]);

  const publishedBlogArticles = useMemo(
    () => blogArticleOptions.map((entry) => ({ ...entry.data, articleId: entry.id })),
    [blogArticleOptions],
  );

  const selectedBlogPageArticles = useMemo(() => {
    const byId = new Map(publishedBlogArticles.map((item) => [String(item.articleId || "").trim(), item]));
    const ordered = [];
    (blogPageData.pageIds || []).forEach((id) => {
      const key = String(id || "").trim();
      if (!key) return;
      const article = byId.get(key);
      if (!article) return;
      ordered.push(article);
      byId.delete(key);
    });
    return ordered;
  }, [blogPageData.pageIds, publishedBlogArticles]);

  const featuredBlogPageArticle = useMemo(() => {
    const id = String(blogPageData.featuredPageId || blogPageData.featuredArticleId || "").trim();
    if (!id) return selectedBlogPageArticles[0] || null;
    return (
      selectedBlogPageArticles.find((item) => String(item.articleId || "") === id) ||
      publishedBlogArticles.find((item) => String(item.articleId || "") === id) ||
      null
    );
  }, [blogPageData.featuredPageId, blogPageData.featuredArticleId, publishedBlogArticles, selectedBlogPageArticles]);

  const retoursById = useMemo(
    () =>
      new Map(
        retours
          .map((item) => [String(item.id || "").trim(), item])
          .filter(([id]) => id),
      ),
    [retours],
  );

  const closeTestimonialEditor = () => {
    if (testimonialEditorSaving) return;
    setTestimonialEditorOpen(false);
    setTestimonialEditorIndex(-1);
    setTestimonialEditorData(toTestimonialEditForm(null, {}));
  };

  const openTestimonialEditor = (index) => {
    const item = homeData?.testimonials?.[index];
    if (!item) return;
    const retourId = String(item?.retourId || "").trim();
    const linkedRetour = retourId ? retoursById.get(retourId) : null;
    setTestimonialEditorIndex(index);
    setTestimonialEditorData(toTestimonialEditForm(linkedRetour || null, item));
    setTestimonialEditorOpen(true);
  };

  const saveTestimonialEditor = async () => {
    const identity = String(testimonialEditorData.identite || "").trim();
    const text = String(testimonialEditorData.retourQualitatif || "").trim();
    if (!identity || !text) {
      showToast("Nom et contenu du témoignage requis", "warning");
      return;
    }
    if (testimonialEditorIndex < 0) return;

    setTestimonialEditorSaving(true);
    try {
      let retourId = String(testimonialEditorData.retourId || "").trim();
      const payload = {
        identite: identity,
        type: normalizeTestimonialType(testimonialEditorData.type),
        sejour: String(testimonialEditorData.sejour || "").trim(),
        date: String(testimonialEditorData.date || "").trim() || null,
        note: Number(testimonialEditorData.note || 10) || 10,
        retourQualitatif: text,
        photoUrl: String(testimonialEditorData.photoUrl || "").trim(),
        photoPath: String(testimonialEditorData.photoPath || "").trim(),
        updatedAt: serverTimestamp(),
      };

      if (retourId) {
        await updateDoc(doc(db, "retours", retourId), payload);
      } else {
        const created = await addDoc(collection(db, "retours"), {
          ...payload,
          source: "manual_dashboard",
          createdAt: serverTimestamp(),
        });
        retourId = created.id;
      }

      setHomeData((prev) => {
        const next = [...(prev.testimonials || [])];
        if (!next[testimonialEditorIndex]) return prev;
        next[testimonialEditorIndex] = toHomepageTestimonialFromForm(
          { ...testimonialEditorData, retourId },
          next[testimonialEditorIndex],
        );
        return { ...prev, testimonials: next };
      });

      setRetours((prev) => {
        const nextItem = {
          id: retourId,
          identite: payload.identite,
          type: payload.type,
          sejour: payload.sejour,
          date: payload.date,
          note: payload.note,
          retourQualitatif: payload.retourQualitatif,
          photoUrl: payload.photoUrl,
          photoPath: payload.photoPath,
        };
        const exists = prev.some((item) => String(item.id) === retourId);
        if (exists) {
          return prev.map((item) => (String(item.id) === retourId ? { ...item, ...nextItem } : item));
        }
        return [nextItem, ...prev];
      });

      showToast("Témoignage mis à jour", "success");
      closeTestimonialEditor();
    } catch {
      showToast("Erreur de sauvegarde du témoignage", "error");
    } finally {
      setTestimonialEditorSaving(false);
    }
  };

  /* Load */
  const loadAll = async () => {
    setLoading(true);
    try {
      const [pageSnap, sejoursSnap, photosSnap, pagesSnap] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.PAGES, pageId)),
        getDocs(collection(db, COLLECTIONS.SEJOURS)),
        getDocs(collection(db, COLLECTIONS.PHOTOS)),
        getDocs(collection(db, COLLECTIONS.PAGES)),
      ]);

      if (!pageSnap.exists()) { setDocExists(false); setLoading(false); return; }

      const pd = pageSnap.data();
      const normalizedPath = normalizePath(pd?.path || "/");
      const home = normalizedPath === "/";
      const blogRoot = normalizedPath === "/blog";
      const contentPage = !home && !blogRoot;
      const hd = normalizeHome(pd?.data || {});
      const homeEditorData =
        home && (!Array.isArray(hd.galeriePhotos) || hd.galeriePhotos.length === 0)
          ? {
              ...hd,
              galeriePhotos: DEFAULT_HOME_GALLERY_FALLBACK.map((src) => normalizeGalleryEntry(src)).filter(Boolean),
            }
          : hd;

      setDocExists(true);
      setIsHomePage(home);
      setIsBlogPage(blogRoot);
      setIsBlogArticle(contentPage);
      setBlogPageData(normalizeBlogPageData(pd?.data || {}));
      setPageMeta({
        nom: pd?.nom || "",
        path: normalizedPath,
        heroImage: pd?.heroImage || "",
        eyebrow: pd?.eyebrow || "",
        subtitle: pd?.subtitle || "",
        body: pd?.body || "",
        status: "published",
        useFirebaseBody: pd?.useFirebaseBody === true,
      });
      setHomeData(homeEditorData);

      const ids = (homeEditorData.trips || []).slice(0, 2).map((t) => {
        if (t?.sejourId) return String(t.sejourId);
        const m = String(t?.href || "").match(/\/sejours\/([^/?#]+)/i);
        return m ? m[1] : "";
      });
      setFeaturedSejours([ids[0] || "", ids[1] || ""]);

      setSejours(sejoursSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr")));
      setPhotosLibrary(photosSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setBlogItems(
        pagesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => {
            const path = normalizePath(item.path || "");
            if (!path || path === "/" || path === "/blog") return false;
            const status = String(item?.status || "published").toLowerCase();
            return status === "published";
          }),
      );

      if (home) {
        setOpenSections(new Set(["meta", "hero", "sejours"]));
      } else if (blogRoot) {
        setOpenSections(new Set(["meta", "blog-page", "contenu"]));
      }
    } catch {
      showToast("Erreur de chargement", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [pageId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "retours"),
      (snapshot) => {
        setRetours(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      },
      () => {
        setRetours([]);
      },
    );
    return () => unsubscribe();
  }, []);

  /* Save */
  const savePage = async () => {
    setSaving(true);
    try {
      const normalizedPath = normalizePath(pageMeta.path);
      let articlePath = normalizedPath;
      if (isBlogArticle) {
        const rawSlug = normalizedPath.startsWith("/blog/")
          ? normalizedPath.replace(/^\/blog\//, "")
          : normalizedPath.replace(/^\//, "");
        const safeSlug = slugify(rawSlug || pageMeta.nom || pageId) || "page";
        articlePath = `/${safeSlug}`;
      }
      const payload = {
        nom: pageMeta.nom,
        path: articlePath,
        heroImage: pageMeta.heroImage,
        eyebrow: pageMeta.eyebrow || "",
        subtitle: pageMeta.subtitle || "",
        body: pageMeta.body,
        status: "published",
        useFirebaseBody: isHomePage || isBlogPage ? false : pageMeta.useFirebaseBody === true,
        updatedAt: serverTimestamp(),
      };
      if (isBlogArticle) {
        payload.slug = articlePath.replace(/^\//, "");
      }
      if (isHomePage) {
        payload.data = {
          ...homeData,
          blogArticles: dedupeBlogArticles(homeData.blogArticles || []),
        };
      } else if (isBlogPage) {
        payload.data = normalizeBlogPageData(blogPageData);
      }
      await updateDoc(doc(db, COLLECTIONS.PAGES, pageId), payload);
      if (payload.path !== pageMeta.path) {
        setPageMeta((prev) => ({ ...prev, path: payload.path }));
      }
      showToast("Page sauvegardée !", "success");
    } catch {
      showToast("Erreur de sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrentPage = async () => {
    showToast(
      "Attention : la suppression est définitive et impacte la page en ligne.",
      "warning",
    );
    const ok = window.confirm(
      `Supprimer définitivement la page \"${pageMeta.nom || pageMeta.path}\" ?`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.PAGES, pageId));
      showToast("Page supprimée", "success");
      router.push("/dashboard/pages");
    } catch {
      showToast("Suppression impossible", "error");
    } finally {
      setDeleting(false);
    }
  };

  /* setHomeText helper */
  const setHT = (key, value) => setHomeData((p) => ({ ...p, text: { ...p.text, [key]: value } }));
  const setHM = (key, value) => setHomeData((p) => ({ ...p, media: { ...p.media, [key]: value } }));

  /* ── Loading / not found states ── */
  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-detail-topbar">
          <div className="dash-skeleton-line" style={{ width: 200, height: 20, display: "inline-block" }} />
        </div>
        <div className="dash-accordion">
          {[1, 2, 3].map((i) => (
            <div key={i} className="dash-accordion-item" style={{ padding: 18 }}>
              <div className="dash-skeleton-line" style={{ height: 14, width: "40%" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!docExists) {
    return (
      <div className="dash-page">
        <div className="dash-detail-topbar">
          <Link href="/dashboard/pages" className="dash-btn">← Pages</Link>
          <h1>Page introuvable</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page">
      {/* ── Topbar ── */}
      <div className="dash-detail-topbar">
        <Link href="/dashboard/pages" className="dash-btn">← Pages</Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>
            {isHomePage ? "Page d'accueil" : isBlogPage ? "Page blog" : pageMeta.nom || "Édition page"}
          </h1>
          <span style={{ fontSize: 12, color: "var(--dash-muted)" }}>{pageMeta.path}</span>
        </div>
        <div className="dash-row-actions">
          <Badge label="Publié (live)" variant="success" />
          <button
            type="button"
            className="dash-btn dash-btn-danger"
            onClick={deleteCurrentPage}
            disabled={deleting || saving}
          >
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={savePage} disabled={saving || deleting}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {/* ── Accordion ── */}
      <div className="dash-accordion">

        {/* 1. Méta */}
        <AccSection
          id="meta"
          label="Méta & Identité"
          icon={<Ico d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" d2="M14 2v5h5M9 12h6M9 16h4" />}
          isOpen={openSections.has("meta")}
          onToggle={toggle}
        >
          <div className="dash-form-grid">
            <label>Nom de la page
              <input className="dash-input" value={pageMeta.nom} onChange={(e) => setPageMeta((p) => ({ ...p, nom: e.target.value }))} />
            </label>
            <label>Chemin URL
              <input className="dash-input" value={pageMeta.path} onChange={(e) => setPageMeta((p) => ({ ...p, path: e.target.value }))} />
            </label>
            <label>Mot au-dessus du titre (eyebrow)
              <input className="dash-input" placeholder="Ex : À propos, L'équipe…" value={pageMeta.eyebrow || ""} onChange={(e) => setPageMeta((p) => ({ ...p, eyebrow: e.target.value }))} />
            </label>
            <label>Sous-titre du héros
              <input className="dash-input" placeholder="Une phrase courte sous le titre" value={pageMeta.subtitle || ""} onChange={(e) => setPageMeta((p) => ({ ...p, subtitle: e.target.value }))} />
            </label>
          </div>
        </AccSection>

        {/* 2. Héros */}
        <AccSection
          id="hero"
          label="Image / Vidéo Héros"
          icon={<Ico d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11" d2="M16 16l5 5M21 16l-5 5" />}
          isOpen={openSections.has("hero")}
          onToggle={toggle}
          color="#eef2ff"
        >
          <div className="dash-form-grid" style={{ marginBottom: 0 }}>
            <PhotoField
              label="Source héros (image ou vidéo)"
              value={isHomePage ? homeData.media?.heroSrc : pageMeta.heroImage}
              onChange={(v) => {
                if (isHomePage) { setHM("heroSrc", v); setPageMeta((p) => ({ ...p, heroImage: v })); }
                else setPageMeta((p) => ({ ...p, heroImage: v }));
              }}
              onPickerOpen={() => openPicker(isHomePage ? { scope: "homeMedia", key: "heroSrc" } : { scope: "pageHero" })}
              uploading={uploading === "homeMedia-heroSrc" || uploading === "pageHero-"}
              accept="image/*,video/mp4,video/webm"
              onFileUpload={(f) => uploadAndSet(f, isHomePage ? "homeMedia" : "pageHero", "heroSrc")}
            />
            {isHomePage && (
              <PhotoField
                label="Poster / image de secours"
                value={homeData.media?.heroPoster}
                onChange={(v) => setHM("heroPoster", v)}
                onPickerOpen={() => openPicker({ scope: "homeMedia", key: "heroPoster" })}
                uploading={uploading === "homeMedia-heroPoster"}
                onFileUpload={(f) => uploadAndSet(f, "homeMedia", "heroPoster")}
              />
            )}
          </div>
        </AccSection>

        {/* ── Homepage-only sections ── */}
        {isHomePage && (
          <>
            {/* 3. Séjours mis en avant */}
            <AccSection
              id="sejours"
              label="Séjours mis en avant"
              icon={<Ico d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" d2="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8" />}
              badge={featuredSejours.filter(Boolean).length + "/2"}
              isOpen={openSections.has("sejours")}
              onToggle={toggle}
              color="#ecfdf5"
            >
              <div className="dash-form-grid">
                {[0, 1].map((slot) => {
                  const trip = homeData.trips?.[slot] || {};
                  return (
                    <div key={slot} style={{ background: "#faf8fe", border: "1px solid rgba(120,90,160,0.12)", borderRadius: 12, padding: 14, display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: 13 }}>Séjour {slot + 1}</strong>
                        {slot === 0 && <Badge label="Séjour phare" variant="info" />}
                        {slot === 1 && <Badge label="Nouveauté 2026" variant="success" />}
                      </div>
                      <select
                        className="dash-input"
                        value={featuredSejours[slot] || ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          setFeaturedSejours((p) => { const n = [...p]; n[slot] = id; return n; });
                          const s = sejours.find((x) => x.id === id);
                          if (!s) return;
                          setHomeData((p) => {
                            const trips = [...(p.trips || [])];
                            trips[slot] = {
                              ...(trips[slot] || {}),
                              sejourId: s.id, href: `/sejours/${s.id}`,
                              title: s.name || "", image: s.heroImage || "",
                              age: fmtSejourAge(s), dates: "",
                              badge: slot === 0 ? "Séjour phare" : "Nouveauté 2026",
                              cta: "Découvrir le séjour",
                            };
                            return { ...p, trips };
                          });
                        }}
                      >
                        <option value="">— Choisir un séjour —</option>
                        {sejours.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
                      </select>
                      {trip.image && (
                        <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "var(--dash-shadow)" }}>
                          <img src={trip.image} alt={trip.title} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                          <div style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600 }}>{trip.title}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </AccSection>

            {/* 4–6. Text groups */}
            {TEXT_GROUPS.map((group) => (
              <AccSection
                key={group.id}
                id={group.id}
                label={`Textes — ${group.label}`}
                icon={<Ico d="M4 6h16M4 10h16M4 14h10" />}
                isOpen={openSections.has(group.id)}
                onToggle={toggle}
              >
                <div className="dash-form-grid">
                  {group.fields.map(([key, label, type]) => (
                    <label key={key} className={type === "textarea" ? "dash-span-2" : ""} style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>
                      {label}
                      {type === "textarea" ? (
                        <textarea
                          className="dash-input"
                          rows={3}
                          value={homeData.text?.[key] || ""}
                          onChange={(e) => setHT(key, e.target.value)}
                          style={{ resize: "vertical" }}
                          placeholder={`Texte pour "${label}"`}
                        />
                      ) : (
                        <input
                          className="dash-input"
                          value={homeData.text?.[key] || ""}
                          onChange={(e) => setHT(key, e.target.value)}
                          placeholder={`Texte pour "${label}"`}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </AccSection>
            ))}

            {/* 7. Pages affichées sur la homepage */}
            <AccSection
              id="blog-home"
              label="Pages mises en avant (homepage)"
              icon={<Ico d="M4 6h16M4 12h16M4 18h16" />}
              badge={`${selectedBlogArticles.length} page${selectedBlogArticles.length > 1 ? "s" : ""}`}
              isOpen={openSections.has("blog-home")}
              onToggle={toggle}
              color="#eef6ff"
            >
              <div style={{ display: "grid", gap: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>
                  Ajouter une page publiée
                  <div className="dash-copy-field">
                    <select className="dash-input" value={blogToAdd} onChange={(e) => setBlogToAdd(e.target.value)}>
                      <option value="">— Choisir une page —</option>
                      {blogOptions.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="dash-btn" onClick={() => addBlogToHomepage(blogToAdd)}>
                      + Ajouter
                    </button>
                  </div>
                </label>

                <p className="dash-muted" style={{ margin: 0, fontSize: 12 }}>
                  Tu choisis ici les pages visibles sur la homepage et leur ordre d'affichage. Toutes les pages publiées sont disponibles.
                </p>

                {selectedBlogArticles.length === 0 ? (
                  <p className="dash-muted" style={{ fontSize: 13 }}>Aucune page sélectionnée.</p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {selectedBlogArticles.map((article, i) => (
                      <div
                        key={`${article.articleId || article.slug || article.href || article.title}-${i}`}
                        style={{
                          background: "#f7fbff",
                          border: "1px solid rgba(80,120,180,0.16)",
                          borderRadius: 12,
                          padding: 12,
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                            {article.image ? (
                              <img
                                src={article.image}
                                alt={article.title}
                                style={{ width: 64, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 64,
                                  height: 48,
                                  borderRadius: 8,
                                  background: "rgba(80,120,180,0.12)",
                                  color: "#466394",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                NO IMG
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dash-text)" }}>{article.title || "Sans titre"}</div>
                              <div style={{ fontSize: 11, color: "var(--dash-muted)" }}>{article.category || "Blog"}</div>
                              <div style={{ fontSize: 11, color: "var(--dash-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
                                {article.href || "/blog"}
                              </div>
                            </div>
                          </div>

                          <div className="dash-row-actions">
                            <button
                              type="button"
                              className="dash-btn"
                              style={{ height: 28, fontSize: 11 }}
                              onClick={() =>
                                setHomeData((p) => {
                                  const rows = [...(p.blogArticles || [])];
                                  const [moved] = rows.splice(i, 1);
                                  if (i > 0) rows.splice(i - 1, 0, moved);
                                  return { ...p, blogArticles: rows };
                                })
                              }
                              disabled={i === 0}
                            >
                              Monter
                            </button>
                            <button
                              type="button"
                              className="dash-btn"
                              style={{ height: 28, fontSize: 11 }}
                              onClick={() =>
                                setHomeData((p) => {
                                  const rows = [...(p.blogArticles || [])];
                                  const [moved] = rows.splice(i, 1);
                                  if (i < rows.length) rows.splice(i + 1, 0, moved);
                                  return { ...p, blogArticles: rows };
                                })
                              }
                              disabled={i === selectedBlogArticles.length - 1}
                            >
                              Descendre
                            </button>
                            <button
                              type="button"
                              className="dash-btn dash-btn-danger"
                              style={{ height: 28, fontSize: 11 }}
                              onClick={() =>
                                setHomeData((p) => ({
                                  ...p,
                                  blogArticles: (p.blogArticles || []).filter((_, j) => j !== i),
                                }))
                              }
                            >
                              Retirer
                            </button>
                          </div>
                        </div>

                        {article.excerpt ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--dash-muted)",
                              lineHeight: 1.5,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {article.excerpt}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AccSection>

            {/* 8. Photos bento */}
            <AccSection
              id="bento"
              label="Photos bento (bloc visuel)"
              icon={<Ico d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8" />}
              isOpen={openSections.has("bento")}
              onToggle={toggle}
              color="#fff4ec"
            >
              <div className="dash-form-grid">
                {[
                  { key: "streamPortraitImage", label: "Photo gauche (portrait)" },
                  { key: "streamAmbianceImage", label: "Photo droite (ambiance)" },
                ].map(({ key, label }) => (
                  <PhotoField
                    key={key}
                    label={label}
                    value={homeData.media?.[key]}
                    onChange={(v) => setHM(key, v)}
                    onPickerOpen={() => openPicker({ scope: "homeMedia", key })}
                    uploading={uploading === `homeMedia-${key}`}
                    onFileUpload={(f) => uploadAndSet(f, "homeMedia", key)}
                  />
                ))}
              </div>
            </AccSection>

            {/* 9. Témoignages */}
            <AccSection
              id="temoignages"
              label="Témoignages homepage"
              icon={<Ico d="M7 17h4l2-5V7H7v5h4M14 17h4l2-5V7h-6v5h4" />}
              badge={`${(homeData.testimonials || []).length} affiché${(homeData.testimonials || []).length > 1 ? "s" : ""}`}
              isOpen={openSections.has("temoignages")}
              onToggle={toggle}
              color="#fffbeb"
            >
              <div style={{ display: "grid", gap: 16 }}>
                <div className="dash-form-grid">
                  <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>
                    Nombre affiché
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="dash-input"
                      value={homeData.testimonialsCount || 6}
                      onChange={(e) =>
                        setHomeData((p) => ({ ...p, testimonialsCount: Number(e.target.value || 1) }))
                      }
                    />
                  </label>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>
                    Ajouter depuis les retours Firestore
                    <div className="dash-copy-field">
                      <select className="dash-input" value={retourToAdd} onChange={(e) => setRetourToAdd(e.target.value)}>
                        <option value="">— Choisir un retour —</option>
                        {retourOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="dash-btn" onClick={() => addRetourToHomepage(retourToAdd)}>
                        + Ajouter
                      </button>
                    </div>
                  </label>
                </div>

                <p className="dash-muted" style={{ margin: 0, fontSize: 12 }}>
                  Le texte des avis vient du document Firestore d'origine. Ici tu choisis seulement quels témoignages afficher,
                  leur ordre, et la photo liée.
                </p>

                {(homeData.testimonials || []).length === 0 ? (
                  <p className="dash-muted" style={{ fontSize: 13 }}>Aucun témoignage ajouté.</p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      alignItems: "start",
                    }}
                  >
                    {(homeData.testimonials || []).map((item, i) => {
                      const linkedRetour = item?.retourId ? retoursById.get(String(item.retourId)) : null;
                      const effectiveAvatar =
                        String(item?.avatar || "").trim() ||
                        String(linkedRetour?.photoUrl || "").trim() ||
                        String(item?.sourceAvatar || "").trim();
                      const effectiveSourceAvatar =
                        String(linkedRetour?.photoUrl || "").trim() ||
                        String(item?.sourceAvatar || "").trim() ||
                        "";
                      const effectiveName = item?.displayName || item?.name || linkedRetour?.identite || "Anonyme";
                      const effectivePeriod = item?.period || linkedRetour?.sejour || "";

                      return (
                      <div
                        key={i}
                        style={{
                          background: "#faf8fe",
                          border: "1px solid rgba(120,90,160,0.12)",
                          borderRadius: 12,
                          padding: 14,
                          minHeight: 236,
                          display: "grid",
                          gridTemplateRows: "auto 1fr",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {effectiveAvatar ? (
                              <img src={effectiveAvatar} alt={effectiveName} style={{ width: 36, height: 36, borderRadius: 999, objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: 999, background: "#e8d5ef", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "var(--dash-accent)" }}>
                                {String(effectiveName || "?")[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <strong style={{ fontSize: 13 }}>{effectiveName}</strong>
                              <div style={{ fontSize: 11, color: "var(--dash-muted)" }}>
                                {item.type}
                                {effectivePeriod ? ` · ${effectivePeriod}` : ""}
                              </div>
                              {item.retourId ? (
                                <div style={{ fontSize: 11, color: "var(--dash-muted)" }}>Source: retours/{item.retourId}</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="dash-row-actions">
                            <button
                              type="button"
                              className="dash-btn"
                              style={{ height: 28, fontSize: 11 }}
                              onClick={() =>
                                setHomeData((p) => {
                                  const ts = [...(p.testimonials || [])];
                                  const [m] = ts.splice(i, 1);
                                  if (i > 0) ts.splice(i - 1, 0, m);
                                  return { ...p, testimonials: ts };
                                })
                              }
                              disabled={i === 0}
                            >
                              Monter
                            </button>
                            <button
                              type="button"
                              className="dash-btn"
                              style={{ height: 28, fontSize: 11 }}
                              onClick={() => openTestimonialEditor(i)}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="dash-btn"
                              style={{ height: 28, fontSize: 11 }}
                              onClick={() =>
                                setHomeData((p) => {
                                  const ts = [...(p.testimonials || [])];
                                  const [m] = ts.splice(i, 1);
                                  if (i < ts.length) ts.splice(i + 1, 0, m);
                                  return { ...p, testimonials: ts };
                                })
                              }
                              disabled={i === (homeData.testimonials || []).length - 1}
                            >
                              Descendre
                            </button>
                            <button
                              type="button"
                              className="dash-btn dash-btn-danger"
                              style={{ height: 28, fontSize: 11 }}
                              onClick={() =>
                                setHomeData((p) => ({
                                  ...p,
                                  testimonials: (p.testimonials || []).filter((_, j) => j !== i),
                                }))
                              }
                            >
                              Retirer
                            </button>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ background: "#ffffff", border: "1px solid rgba(120,90,160,0.12)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "var(--dash-text)" }}>
                            <strong style={{ display: "block", marginBottom: 4 }}>Aperçu homepage</strong>
                            <span
                              style={{
                                color: "var(--dash-muted)",
                                display: "-webkit-box",
                                WebkitLineClamp: 4,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {item.excerpt || item.fullText || "Aucun texte."}
                            </span>
                          </div>

                          <label style={{ fontSize: 12, fontWeight: 600, display: "grid", gap: 4 }}>
                            Photo liée
                            <div className="dash-copy-field">
                              <input className="dash-input" style={{ minHeight: 32 }} value={effectiveAvatar || ""} readOnly />
                              <button type="button" className="dash-btn" onClick={() => openPicker({ scope: "testimonialAvatar", index: i })}>
                                Galerie
                              </button>
                            </div>
                            <div className="dash-row-actions">
                              <label className="dash-btn" style={{ justifyContent: "center", cursor: "pointer", fontSize: 12, height: 30 }}>
                                {uploading === `testimonialAvatar-${i}` ? "Upload…" : "⬆ Upload"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                      uploadAndSet(f, "testimonialAvatar", "", i);
                                      e.target.value = "";
                                    }
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="dash-btn"
                                style={{ height: 30, fontSize: 12 }}
                                onClick={() =>
                                  setHomeData((p) => {
                                    const ts = [...(p.testimonials || [])];
                                    ts[i] = { ...ts[i], avatar: effectiveSourceAvatar };
                                    return { ...p, testimonials: ts };
                                  })
                                }
                              >
                                Photo d'origine
                              </button>
                            </div>
                          </label>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </AccSection>

            {/* 10. Galerie homepage */}
            <AccSection
              id="galerie"
              label="Galerie homepage"
              icon={<Ico d="M3 4h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4zm0 6h18" />}
              badge={`${(homeData.galeriePhotos || []).length} photo${(homeData.galeriePhotos || []).length > 1 ? "s" : ""}`}
              isOpen={openSections.has("galerie")}
              onToggle={toggle}
              color="#f0f4ff"
            >
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="dash-btn" onClick={() => { setPickerTarget({ scope: "homeGalleryAdd" }); setPickerOpen(true); }}>
                    + Ajouter depuis la bibliothèque
                  </button>
                  <button type="button" className="dash-btn" onClick={() => {
                    // multi-select via picker — we set a special target
                    setPickerTarget({ scope: "homeGalleryMulti" });
                    setPickerOpen(true);
                  }}>
                    + Ajouter plusieurs photos
                  </button>
                  <label className="dash-btn" style={{ cursor: "pointer" }}>
                    ⬆ Upload direct
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadAndSet(f, "homeGalleryAdd"); e.target.value = ""; } }} />
                  </label>
                </div>

                {(homeData.galeriePhotos || []).length === 0 ? (
                  <p className="dash-muted" style={{ fontSize: 13 }}>Aucune photo dans la galerie.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                    {(homeData.galeriePhotos || []).map((item, i) => {
                      const src = galleryEntrySrc(item);
                      if (!src) return null;
                      const key = typeof item === "object" ? `${item.photoId || item.id || src}-${i}` : `${src}-${i}`;
                      return (
                      <div key={key} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "var(--dash-shadow)" }}>
                        <img src={src} alt={`Galerie ${i + 1}`} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(20,16,42,0)", opacity: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 6, transition: "opacity 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = "rgba(20,16,42,0.3)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = 0; e.currentTarget.style.background = "rgba(20,16,42,0)"; }}
                        >
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            <button type="button" className="dash-icon-btn" style={{ width: 24, height: 24, background: "rgba(255,255,255,0.9)" }} onClick={() => openPicker({ scope: "homeGalleryReplace", index: i })}>✎</button>
                          </div>
                          <button type="button" className="dash-icon-btn" style={{ width: 24, height: 24, background: "rgba(255,255,255,0.9)", alignSelf: "flex-end" }} onClick={() => setHomeData((p) => ({ ...p, galeriePhotos: (p.galeriePhotos || []).filter((_, j) => j !== i) }))}>×</button>
                        </div>
                        <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(255,255,255,0.9)", borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "2px 5px" }}>{i + 1}</div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </AccSection>
          </>
        )}

        {isBlogPage && (
          <AccSection
            id="blog-page"
            label="Configuration de la page Blog"
            icon={<Ico d="M4 6h16M4 12h16M4 18h10" />}
            badge={`${selectedBlogPageArticles.length} page${selectedBlogPageArticles.length > 1 ? "s" : ""}`}
            isOpen={openSections.has("blog-page")}
            onToggle={toggle}
            color="#eef6ff"
          >
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>
                Ajouter une page à la liste
                <div className="dash-copy-field">
                  <select className="dash-input" value={blogToAdd} onChange={(e) => setBlogToAdd(e.target.value)}>
                    <option value="">— Choisir une page —</option>
                    {blogArticleOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="dash-btn" onClick={() => addBlogArticleToBlogPage(blogToAdd)}>
                    + Ajouter
                  </button>
                </div>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>
                Page mise en avant
                <select
                  className="dash-input"
                  value={blogPageData.featuredPageId || blogPageData.featuredArticleId || ""}
                  onChange={(e) =>
                    setBlogPageData((prev) => ({
                      ...prev,
                      featuredPageId: String(e.target.value || "").trim(),
                      featuredArticleId: String(e.target.value || "").trim(),
                    }))
                  }
                >
                  <option value="">— Aucun —</option>
                  {selectedBlogPageArticles.map((article) => (
                    <option key={article.articleId} value={article.articleId}>
                      {article.title}
                    </option>
                  ))}
                </select>
              </label>

              {featuredBlogPageArticle ? (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    borderRadius: 12,
                    border: "1px solid rgba(80,120,180,0.18)",
                    background: "#f8fbff",
                    padding: 12,
                  }}
                >
                  <strong style={{ fontSize: 13 }}>Aperçu page principale</strong>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {featuredBlogPageArticle.image ? (
                      <img
                        src={featuredBlogPageArticle.image}
                        alt={featuredBlogPageArticle.title}
                        style={{ width: 96, height: 64, borderRadius: 8, objectFit: "cover" }}
                      />
                    ) : null}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{featuredBlogPageArticle.title}</div>
                      <div style={{ fontSize: 11, color: "var(--dash-muted)" }}>{featuredBlogPageArticle.href}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBlogPageArticles.length === 0 ? (
                <p className="dash-muted" style={{ fontSize: 13 }}>Aucune page sélectionnée pour le blog.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedBlogPageArticles.map((article, index) => (
                    <div
                      key={`${article.articleId}-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(80,120,180,0.16)",
                        background: "#ffffff",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{article.title}</div>
                        <div style={{ fontSize: 11, color: "var(--dash-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {article.href}
                        </div>
                      </div>
                      <div className="dash-row-actions">
                        <button
                          type="button"
                          className="dash-btn"
                          style={{ height: 28, fontSize: 11 }}
                          onClick={() => moveBlogPageArticle(index, -1)}
                          disabled={index === 0}
                        >
                          Monter
                        </button>
                        <button
                          type="button"
                          className="dash-btn"
                          style={{ height: 28, fontSize: 11 }}
                          onClick={() => moveBlogPageArticle(index, 1)}
                          disabled={index === selectedBlogPageArticles.length - 1}
                        >
                          Descendre
                        </button>
                        <button
                          type="button"
                          className="dash-btn dash-btn-danger"
                          style={{ height: 28, fontSize: 11 }}
                          onClick={() => removeBlogPageArticle(article.articleId)}
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AccSection>
        )}

        {/* Non-homepage: WYSIWYG content */}
        {!isHomePage && (
          <AccSection
            id="contenu"
            label="Contenu de la page"
            icon={<Ico d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" d2="M14 2v5h5" />}
            isOpen={openSections.has("contenu")}
            onToggle={toggle}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              <input
                type="checkbox"
                checked={pageMeta.useFirebaseBody === true}
                onChange={(e) =>
                  setPageMeta((p) => ({ ...p, useFirebaseBody: e.target.checked }))
                }
              />
              Utiliser le contenu Firebase pour cette page
            </label>
            <p className="dash-muted" style={{ marginBottom: 10, fontSize: 12 }}>
              Désactivé = contenu codé actuel conservé. Activé = le HTML ci-dessous est affiché.
            </p>

            <div className="dash-editor-tabs">
              <button
                type="button"
                className={`dash-editor-tab ${pageBodyMode === "wysiwyg" ? "is-active" : ""}`}
                onClick={() => setPageBodyMode("wysiwyg")}
              >
                WYSIWYG
              </button>
              <button
                type="button"
                className={`dash-editor-tab ${pageBodyMode === "html" ? "is-active" : ""}`}
                onClick={() => setPageBodyMode("html")}
              >
                HTML
              </button>
              <button
                type="button"
                className={`dash-editor-tab ${pageBodyMode === "preview" ? "is-active" : ""}`}
                onClick={() => setPageBodyMode("preview")}
              >
                Aperçu
              </button>
            </div>

            <div className="dash-row-actions" style={{ marginBottom: 8 }}>
              <input
                className="dash-input"
                style={{ maxWidth: 340, minHeight: 34 }}
                value={pageImageCaption}
                onChange={(e) => setPageImageCaption(e.target.value)}
                placeholder="Texte alternatif de l’image (optionnel)"
              />
              <button
                type="button"
                className="dash-btn"
                onClick={() => openPicker({ scope: "pageBodyImage", side: "right" })}
              >
                + Image à droite
              </button>
              <button
                type="button"
                className="dash-btn"
                onClick={() => openPicker({ scope: "pageBodyImage", side: "left" })}
              >
                + Image à gauche
              </button>
              <label className="dash-btn" style={{ cursor: "pointer" }}>
                Upload + insertion
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      uploadAndSet(f, "pageBodyImage");
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>

            {pageBodyImages.length ? (
              <div className="dash-inline-image-grid">
                {pageBodyImages.map((src, idx) => (
                  <div key={`${src}-${idx}`} className="dash-inline-image-card">
                    <img src={src} alt={`Image ${idx + 1}`} />
                    <div className="dash-inline-image-meta">Image {idx + 1}</div>
                    <div className="dash-inline-image-actions">
                      <button
                        type="button"
                        className="dash-btn"
                        style={{ height: 28, fontSize: 12 }}
                        onClick={() => openPicker({ scope: "pageBodyImageReplace", index: idx })}
                      >
                        Remplacer (galerie)
                      </button>
                      <label className="dash-btn" style={{ height: 28, fontSize: 12, cursor: "pointer" }}>
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              uploadAndSet(f, "pageBodyImageReplace", "", idx);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {pageBodyMode === "wysiwyg" ? (
              <WysiwygEditor
                value={pageMeta.body}
                onChange={(html) => setPageMeta((p) => ({ ...p, body: html }))}
                minHeight={300}
              />
            ) : null}

            {pageBodyMode === "html" ? (
              <textarea
                className="dash-code-editor"
                value={pageMeta.body}
                onChange={(e) => setPageMeta((p) => ({ ...p, body: e.target.value }))}
                spellCheck={false}
              />
            ) : null}

            {pageBodyMode === "preview" ? (
              <div className="dash-html-preview" dangerouslySetInnerHTML={{ __html: pageMeta.body || "" }} />
            ) : null}
          </AccSection>
        )}
      </div>

      {/* ── PhotoPicker ── */}
      <Modal
        isOpen={testimonialEditorOpen}
        onClose={closeTestimonialEditor}
        title="Modifier le temoignage source"
        size="lg"
      >
        <div className="dash-form-grid">
          <label>
            Nom / identite
            <input
              className="dash-input"
              value={testimonialEditorData.identite}
              onChange={(e) =>
                setTestimonialEditorData((prev) => ({ ...prev, identite: e.target.value }))
              }
            />
          </label>
          <label>
            Type
            <select
              className="dash-input"
              value={testimonialEditorData.type}
              onChange={(e) =>
                setTestimonialEditorData((prev) => ({ ...prev, type: e.target.value }))
              }
            >
              <option value="Parent">Parent</option>
              <option value="Jeune">Jeune</option>
            </select>
          </label>
          <label>
            Sejour
            <input
              className="dash-input"
              value={testimonialEditorData.sejour}
              onChange={(e) =>
                setTestimonialEditorData((prev) => ({ ...prev, sejour: e.target.value }))
              }
            />
          </label>
          <label>
            Date
            <input
              type="date"
              className="dash-input"
              value={testimonialEditorData.date}
              onChange={(e) =>
                setTestimonialEditorData((prev) => ({ ...prev, date: e.target.value }))
              }
            />
          </label>
          <label>
            Note /10
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              className="dash-input"
              value={testimonialEditorData.note}
              onChange={(e) =>
                setTestimonialEditorData((prev) => ({ ...prev, note: Number(e.target.value || 0) }))
              }
            />
          </label>
          <label>
            Photo
            <div className="dash-copy-field">
              <input
                className="dash-input"
                value={testimonialEditorData.photoUrl}
                onChange={(e) =>
                  setTestimonialEditorData((prev) => ({ ...prev, photoUrl: e.target.value }))
                }
              />
              <button
                type="button"
                className="dash-btn"
                onClick={() => openPicker({ scope: "testimonialEditorPhoto" })}
              >
                Galerie
              </button>
            </div>
          </label>
          <label>
            Upload photo
            <div>
              <label className="dash-btn" style={{ cursor: "pointer", justifyContent: "center" }}>
                {uploading === "testimonialEditorPhoto--1" ? "Upload..." : "Uploader"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      uploadAndSet(f, "testimonialEditorPhoto");
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
          </label>
          <label className="dash-span-2">
            Temoignage
            <textarea
              className="dash-input"
              rows={7}
              value={testimonialEditorData.retourQualitatif}
              onChange={(e) =>
                setTestimonialEditorData((prev) => ({ ...prev, retourQualitatif: e.target.value }))
              }
            />
          </label>
        </div>
        {testimonialEditorData.photoUrl ? (
          <div className="dash-home-thumb" style={{ marginTop: 12, maxWidth: 320 }}>
            <img src={testimonialEditorData.photoUrl} alt={testimonialEditorData.identite || "Temoignage"} />
          </div>
        ) : null}
        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={closeTestimonialEditor} disabled={testimonialEditorSaving}>
            Annuler
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={saveTestimonialEditor} disabled={testimonialEditorSaving}>
            {testimonialEditorSaving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </Modal>

      <PhotoPicker
        isOpen={pickerOpen && pickerTarget?.scope !== "homeGalleryMulti"}
        onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
        onSelect={onPhotoSelect}
        title={pickerTarget?.scope === "testimonialEditorPhoto" ? "Choisir une photo de temoignage" : "Choisir une photo"}
      />

      {/* Multi-select picker for gallery */}
      <PhotoPicker
        isOpen={pickerOpen && pickerTarget?.scope === "homeGalleryMulti"}
        onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
        onSelect={(urls) => {
          const list = Array.isArray(urls) ? urls : [urls];
          const entries = list.map((item) => toHomeGalleryEntryFromUrl(item)).filter(Boolean);
          setHomeData((p) => ({ ...p, galeriePhotos: dedupeHomeGallery([...(p.galeriePhotos || []), ...entries]) }));
          setPickerOpen(false);
        }}
        multi
        title="Ajouter plusieurs photos à la galerie"
      />
    </div>
  );
}



