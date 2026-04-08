"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import PhotoPicker from "@/src/components/dashboard/ui/PhotoPicker";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

/* ─── helpers ────────────────────────────────────────────────────────── */
function uniq(list) {
  return Array.from(new Set((list || []).map((x) => String(x || "").trim()).filter(Boolean)));
}

function galleryItemSrc(value) {
  if (typeof value === "string") return String(value || "").trim();
  if (!value || typeof value !== "object") return "";
  return String(value.url || value.src || value.image || "").trim();
}

function normalizeGalleryItem(value) {
  if (typeof value === "string") {
    const src = String(value || "").trim();
    return src || null;
  }
  if (!value || typeof value !== "object") return null;
  const src = galleryItemSrc(value);
  if (!src) return null;
  return {
    photoId: String(value.photoId || value.id || "").trim() || undefined,
    url: src,
    storagePath: String(value.storagePath || "").trim() || undefined,
    album: String(value.album || "").trim() || undefined,
    nom: String(value.nom || "").trim() || undefined,
  };
}

function dedupeGalleryItems(list) {
  const seen = new Set();
  const output = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const normalized = normalizeGalleryItem(item);
    if (!normalized) return;
    const src = galleryItemSrc(normalized);
    if (!src || seen.has(src)) return;
    seen.add(src);
    output.push(normalized);
  });
  return output;
}

function extractFallbackGalleryFromSejour(raw) {
  const pool = [];
  const push = (value) => {
    const src = galleryItemSrc(value);
    if (!src) return;
    if (!src.startsWith("/") && !src.startsWith("http")) return;
    pool.push(src);
  };

  push(raw?.heroImage);
  (raw?.images || []).forEach(push);
  (raw?.photos || []).forEach(push);
  (raw?.summarySubsections || []).forEach((sub) => {
    push(sub?.imageSrc);
    push(sub?.image);
    push(sub?.photo);
  });
  (raw?.sections || []).forEach((section) => {
    push(section?.imageSrc);
    push(section?.image);
    push(section?.photo);
    (section?.subSections || []).forEach((sub) => {
      push(sub?.imageSrc);
      push(sub?.image);
      push(sub?.photo);
    });
  });

  return dedupeGalleryItems(pool);
}

function formatDateInput(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function toIsoDate(v) {
  return v ? `${v}T00:00:00.000Z` : "";
}

function move(arr, from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const EMPTY = {
  name: "", heroSubtitle: "", heroImage: "", environment: "", basePrice: 0, priceMin: 0, priceMax: 0,
  ageGroups: [], dates: [{ startDate: "", endDate: "", basePrice: 0 }],
  stations: [{ name: "Sur Place", priceExtra: 0 }],
  summarySubsections: [{ title: "", text: "", imageSrc: "" }],
  sections: [{ subSections: [{ title: "", text: "", imageSrc: "" }] }],
  galleryImages: [], extraJson: "{}",
};

const KNOWN = new Set(["name","heroSubtitle","heroImage","environment","basePrice","priceMin","priceMax","ageGroups","dates","stations","summarySubsections","sections","galleryImages","createdAt","updatedAt"]);

function normalize(raw) {
  const extra = Object.fromEntries(Object.entries(raw || {}).filter(([k]) => !KNOWN.has(k)));
  return {
    name: raw?.name || "",
    heroSubtitle: raw?.heroSubtitle || "",
    heroImage: raw?.heroImage || "",
    environment: raw?.environment || "",
    basePrice: Number(raw?.basePrice || 0),
    priceMin: Number(raw?.priceMin || 0),
    priceMax: Number(raw?.priceMax || 0),
    ageGroups: (raw?.ageGroups || []).map(String).filter(Boolean),
    dates: Array.isArray(raw?.dates) && raw.dates.length
      ? raw.dates.map((d) => ({ startDate: d.startDate || "", endDate: d.endDate || "", basePrice: Number(d.basePrice || d.price || 0) }))
      : [{ startDate: "", endDate: "", basePrice: 0 }],
    stations: Array.isArray(raw?.stations) && raw.stations.length
      ? raw.stations.map((s) => ({ name: s.name || "", priceExtra: Number(s.priceExtra || 0) }))
      : [{ name: "Sur Place", priceExtra: 0 }],
    summarySubsections: Array.isArray(raw?.summarySubsections) && raw.summarySubsections.length
      ? raw.summarySubsections.map((s) => ({ title: s.title || "", text: s.text || "", imageSrc: s.imageSrc || "" }))
      : [{ title: "", text: "", imageSrc: "" }],
    sections: Array.isArray(raw?.sections) && raw.sections.length
      ? raw.sections.map((s) => ({
          subSections: Array.isArray(s.subSections) && s.subSections.length
            ? s.subSections.map((sub) => ({ title: sub.title || "", text: sub.text || "", imageSrc: sub.imageSrc || "" }))
            : [{ title: "", text: "", imageSrc: "" }],
        }))
      : [{ subSections: [{ title: "", text: "", imageSrc: "" }] }],
    galleryImages: Array.isArray(raw?.galleryImages)
      ? dedupeGalleryItems(raw.galleryImages)
      : extractFallbackGalleryFromSejour(raw),
    extraJson: Object.keys(extra).length ? JSON.stringify(extra, null, 2) : "{}",
  };
}

/* ─── Accordion section wrapper ─────────────────────────────────────── */
function AccSection({ id, label, icon, badge, isOpen, onToggle, children }) {
  return (
    <div className="dash-accordion-item">
      <button type="button" className="dash-accordion-header" onClick={() => onToggle(id)}>
        <span className="dash-accordion-header-icon" style={{ background: "#f0ebf8", color: "var(--dash-accent)" }}>
          {icon}
        </span>
        <span className="dash-accordion-header-title">{label}</span>
        {badge != null ? <span className="dash-accordion-header-count">{badge}</span> : null}
        <svg
          className={`dash-accordion-chevron ${isOpen ? "is-open" : ""}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          strokeWidth="2" strokeLinecap="round" stroke="currentColor"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && <div className="dash-accordion-body">{children}</div>}
    </div>
  );
}

/* ─── Small SVG icons ─────────────────────────────────────────────────── */
const I = (path, extra = "") => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
    <path d={path} />
    {extra && <path d={extra} />}
  </svg>
);

const ICONS = {
  identity:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  calendar:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>,
  transport: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M2 7h14l4 6v3H2V7zm10-5h3l2 5"/></svg>,
  text:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><path d="M4 6h16M4 10h16M4 14h10"/></svg>,
  sections:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 9v12"/></svg>,
  gallery:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5-4 4-2-2-4 4"/></svg>,
  code:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>,
  ages:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

/* ─── Main component ─────────────────────────────────────────────────── */
export default function SejourDetail({ sejourId }) {
  const router = useRouter();
  const { showToast } = useToast();
  const isNew = sejourId === "new";

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState(new Set(["identite"]));

  /* Library picker */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);

  const [newAge, setNewAge] = useState("");
  const [customGallery, setCustomGallery] = useState("");
  const [photosLibrary, setPhotosLibrary] = useState([]);

  const photoByUrl = new Map(
    photosLibrary
      .map((item) => [String(item?.url || "").trim(), item])
      .filter(([src]) => Boolean(src)),
  );

  const toGalleryEntryFromUrl = (url) => {
    const src = String(url || "").trim();
    if (!src) return null;
    const match = photoByUrl.get(src);
    if (!match) return src;
    return {
      photoId: match.id,
      url: src,
      storagePath: match.storagePath || "",
      album: match.album || "",
      nom: match.nom || "",
    };
  };

  /* Load existing sejour */
  useEffect(() => {
    if (isNew) return;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.SEJOURS, sejourId));
        if (!snap.exists()) { showToast("Séjour introuvable", "error"); router.push("/dashboard/sejours"); return; }
        setForm(normalize(snap.data()));
      } catch {
        showToast("Erreur de chargement", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [sejourId]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.PHOTOS));
        setPhotosLibrary(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch {
        setPhotosLibrary([]);
      }
    })();
  }, []);


  /* Section toggle */
  const toggle = (id) => setOpenSections((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  /* Form helpers */
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const updDate = (i, k, v) => setForm((p) => { const n = [...p.dates]; n[i] = { ...n[i], [k]: v }; return { ...p, dates: n }; });
  const addDate = () => setForm((p) => ({ ...p, dates: [...p.dates, { startDate: "", endDate: "", basePrice: 0 }] }));
  const rmDate = (i) => setForm((p) => ({ ...p, dates: p.dates.filter((_, j) => j !== i) }));
  const mvDate = (i, d) => setForm((p) => ({ ...p, dates: move(p.dates, i, i + d) }));

  const updStation = (i, k, v) => setForm((p) => { const n = [...p.stations]; n[i] = { ...n[i], [k]: v }; return { ...p, stations: n }; });
  const addStation = () => setForm((p) => ({ ...p, stations: [...p.stations, { name: "", priceExtra: 0 }] }));
  const rmStation = (i) => setForm((p) => ({ ...p, stations: p.stations.filter((_, j) => j !== i) }));
  const mvStation = (i, d) => setForm((p) => ({ ...p, stations: move(p.stations, i, i + d) }));

  const updSum = (i, k, v) => setForm((p) => { const n = [...p.summarySubsections]; n[i] = { ...n[i], [k]: v }; return { ...p, summarySubsections: n }; });
  const addSum = () => setForm((p) => ({ ...p, summarySubsections: [...p.summarySubsections, { title: "", text: "", imageSrc: "" }] }));
  const rmSum = (i) => setForm((p) => ({ ...p, summarySubsections: p.summarySubsections.filter((_, j) => j !== i) }));
  const mvSum = (i, d) => setForm((p) => ({ ...p, summarySubsections: move(p.summarySubsections, i, i + d) }));

  const addSection = () => setForm((p) => ({ ...p, sections: [...p.sections, { subSections: [{ title: "", text: "", imageSrc: "" }] }] }));
  const rmSection = (si) => setForm((p) => ({ ...p, sections: p.sections.filter((_, i) => i !== si) }));
  const mvSection = (si, d) => setForm((p) => ({ ...p, sections: move(p.sections, si, si + d) }));

  const updSub = (si, subi, k, v) => setForm((p) => {
    const secs = [...p.sections];
    const subs = [...(secs[si].subSections || [])];
    subs[subi] = { ...subs[subi], [k]: v };
    secs[si] = { ...secs[si], subSections: subs };
    return { ...p, sections: secs };
  });
  const addSub = (si) => setForm((p) => {
    const secs = [...p.sections];
    secs[si] = { ...secs[si], subSections: [...(secs[si].subSections || []), { title: "", text: "", imageSrc: "" }] };
    return { ...p, sections: secs };
  });
  const rmSub = (si, subi) => setForm((p) => {
    const secs = [...p.sections];
    secs[si] = { ...secs[si], subSections: (secs[si].subSections || []).filter((_, i) => i !== subi) };
    return { ...p, sections: secs };
  });
  const mvSub = (si, subi, d) => setForm((p) => {
    const secs = [...p.sections];
    secs[si] = { ...secs[si], subSections: move(secs[si].subSections || [], subi, subi + d) };
    return { ...p, sections: secs };
  });

  const addGalleryUrl = () => {
    const url = customGallery.trim();
    if (!url) return;
    if (!url.startsWith("/") && !url.startsWith("http")) { showToast("URL invalide", "warning"); return; }
    const entry = toGalleryEntryFromUrl(url);
    if (!entry) return;
    setForm((p) => ({ ...p, galleryImages: dedupeGalleryItems([...(p.galleryImages || []), entry]) }));
    setCustomGallery("");
  };

  const rmGallery = (index) => setForm((p) => ({ ...p, galleryImages: p.galleryImages.filter((_, idx) => idx !== index) }));
  const mvGallery = (i, d) => setForm((p) => ({ ...p, galleryImages: move(p.galleryImages, i, i + d) }));

  /* Picker */
  const openPicker = (target) => { setPickerTarget(target); setPickerOpen(true); };

  const applyPicker = (selected) => {
    if (!pickerTarget) return;
    const selectedUrls = Array.isArray(selected) ? selected : [selected];
    const first = selectedUrls[0];
    if (!first) return;
    if (pickerTarget.type === "hero") set("heroImage", first);
    if (pickerTarget.type === "gallery") {
      const entries = selectedUrls
        .map((item) => toGalleryEntryFromUrl(item))
        .filter(Boolean);
      setForm((p) => ({ ...p, galleryImages: dedupeGalleryItems([...(p.galleryImages || []), ...entries]) }));
    }
    if (pickerTarget.type === "summary") updSum(pickerTarget.index, "imageSrc", first);
    if (pickerTarget.type === "sectionSub") updSub(pickerTarget.si, pickerTarget.subi, "imageSrc", first);
    setPickerOpen(false);
  };

  /* Save */
  const onSave = async () => {
    let extra = {};
    try { extra = JSON.parse(form.extraJson || "{}"); } catch { showToast("JSON avancé invalide", "error"); return; }

    const payload = {
      ...extra,
      name: form.name.trim() || "Séjour",
      heroSubtitle: form.heroSubtitle,
      heroImage: form.heroImage,
      environment: form.environment,
      basePrice: Number(form.basePrice || 0),
      priceMin: Number(form.priceMin || 0),
      priceMax: Number(form.priceMax || 0),
      ageGroups: form.ageGroups,
      dates: form.dates.map((d) => ({
        startDate: toIsoDate(formatDateInput(d.startDate)),
        endDate: toIsoDate(formatDateInput(d.endDate)),
        basePrice: Number(d.basePrice || 0),
      })),
      stations: form.stations,
      summarySubsections: form.summarySubsections,
      sections: form.sections,
      galleryImages: dedupeGalleryItems(form.galleryImages),
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (isNew) {
        const ref = await addDoc(collection(db, COLLECTIONS.SEJOURS), { ...payload, createdAt: serverTimestamp() });
        showToast("Séjour créé !", "success");
        router.replace(`/dashboard/sejours/${ref.id}`);
      } else {
        await updateDoc(doc(db, COLLECTIONS.SEJOURS, sejourId), payload);
        showToast("Séjour sauvegardé", "success");
      }
    } catch {
      showToast("Erreur de sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  };

  /* Delete */
  const onDelete = async () => {
    if (isNew || !window.confirm(`Supprimer "${form.name || "ce séjour"}" définitivement ?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.SEJOURS, sejourId));
      showToast("Séjour supprimé", "success");
      router.push("/dashboard/sejours");
    } catch {
      showToast("Erreur de suppression", "error");
    }
  };

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-detail-topbar">
          <div className="dash-skeleton-line" style={{ width: 120, height: 20, display: "inline-block" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page">
      {/* ── Sticky topbar ── */}
      <div className="dash-detail-topbar">
        <button type="button" className="dash-btn" onClick={() => router.push("/dashboard/sejours")}>
          ← Séjours
        </button>
        <h1>{form.name || (isNew ? "Nouveau séjour" : "Séjour sans titre")}</h1>
        <div className="dash-row-actions">
          {!isNew && (
            <button type="button" className="dash-btn dash-btn-danger" onClick={onDelete}>
              Supprimer
            </button>
          )}
          <button type="button" className="dash-btn dash-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement…" : isNew ? "Créer le séjour" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {/* ── Accordion sections ── */}
      <div className="dash-accordion">

        {/* 1. Identité */}
        <AccSection id="identite" label="Identité & Image héros" icon={ICONS.identity} isOpen={openSections.has("identite")} onToggle={toggle}>
          <div className="dash-form-grid" style={{ marginTop: 14 }}>
            <label>Nom du séjour <span style={{ color: "red" }}>*</span>
              <input className="dash-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ex: My Creative Surf Camp" />
            </label>
            <label>Sous-titre héros
              <input className="dash-input" value={form.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} placeholder="Tagline affiché sous le titre" />
            </label>
            <label>Environnement
              <input className="dash-input" value={form.environment} onChange={(e) => set("environment", e.target.value)} placeholder="ex: Surf, Ski, Musique..." />
            </label>
            <label>Prix minimum (€)
              <input type="number" className="dash-input" value={form.priceMin} onChange={(e) => set("priceMin", Number(e.target.value))} placeholder="ex: 800" />
            </label>
            <label>Prix maximum (€)
              <input type="number" className="dash-input" value={form.priceMax} onChange={(e) => set("priceMax", Number(e.target.value))} placeholder="ex: 1400" />
            </label>
            <label className="dash-span-2">Image héros (URL)
              <div className="dash-copy-field">
                <input className="dash-input" value={form.heroImage} onChange={(e) => set("heroImage", e.target.value)} placeholder="/public/... ou https://..." />
                <button type="button" className="dash-btn" onClick={() => openPicker({ type: "hero" })}>Choisir</button>
              </div>
              {form.heroImage && (
                <div style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", maxWidth: 360, boxShadow: "var(--dash-shadow)" }}>
                  <img src={form.heroImage} alt="Aperçu héros" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                </div>
              )}
            </label>
          </div>
        </AccSection>

        {/* 2. Tranches d'âge */}
        <AccSection id="ages" label="Tranches d'âge" icon={ICONS.ages} badge={form.ageGroups.length || null} isOpen={openSections.has("ages")} onToggle={toggle}>
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <div className="dash-copy-field">
              <input
                className="dash-input"
                value={newAge}
                onChange={(e) => setNewAge(e.target.value)}
                placeholder="ex: 11-13 ans"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), newAge.trim() && (setForm((p) => ({ ...p, ageGroups: uniq([...p.ageGroups, newAge.trim()]) })), setNewAge("")))}
              />
              <button type="button" className="dash-btn" onClick={() => { if (newAge.trim()) { setForm((p) => ({ ...p, ageGroups: uniq([...p.ageGroups, newAge.trim()]) })); setNewAge(""); } }}>
                Ajouter
              </button>
            </div>
            {form.ageGroups.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {form.ageGroups.map((age) => (
                  <button key={age} type="button" className="dash-btn" onClick={() => setForm((p) => ({ ...p, ageGroups: p.ageGroups.filter((x) => x !== age) }))}>
                    {age} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </AccSection>

        {/* 3. Dates & Tarifs */}
        <AccSection id="dates" label="Dates & Tarifs par période" icon={ICONS.calendar} badge={form.dates.length} isOpen={openSections.has("dates")} onToggle={toggle}>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {form.dates.map((d, i) => (
              <div key={i} style={{ background: "#faf8fe", border: "1px solid rgba(120,90,160,0.12)", borderRadius: 10, padding: 14 }}>
                <div className="dash-form-grid">
                  <label>Début<input type="date" className="dash-input" value={formatDateInput(d.startDate)} onChange={(e) => updDate(i, "startDate", e.target.value)} /></label>
                  <label>Fin<input type="date" className="dash-input" value={formatDateInput(d.endDate)} onChange={(e) => updDate(i, "endDate", e.target.value)} /></label>
                  <label>Prix (€)<input type="number" className="dash-input" value={d.basePrice} onChange={(e) => updDate(i, "basePrice", Number(e.target.value))} /></label>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className="dash-btn" onClick={() => mvDate(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="dash-btn" onClick={() => mvDate(i, 1)} disabled={i === form.dates.length - 1}>↓</button>
                    <button type="button" className="dash-btn dash-btn-danger" onClick={() => rmDate(i)}>Suppr.</button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="dash-btn" style={{ justifySelf: "start" }} onClick={addDate}>+ Ajouter une période</button>
          </div>
        </AccSection>

        {/* 4. Transports */}
        <AccSection id="transport" label="Stations & Transport" icon={ICONS.transport} badge={form.stations.length} isOpen={openSections.has("transport")} onToggle={toggle}>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {form.stations.map((s, i) => (
              <div key={i} style={{ background: "#faf8fe", border: "1px solid rgba(120,90,160,0.12)", borderRadius: 10, padding: 14 }}>
                <div className="dash-form-grid">
                  <label>Nom station<input className="dash-input" value={s.name} onChange={(e) => updStation(i, "name", e.target.value)} /></label>
                  <label>Surcoût (€)<input type="number" className="dash-input" value={s.priceExtra} onChange={(e) => updStation(i, "priceExtra", Number(e.target.value))} /></label>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                    <button type="button" className="dash-btn" onClick={() => mvStation(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="dash-btn" onClick={() => mvStation(i, 1)} disabled={i === form.stations.length - 1}>↓</button>
                    <button type="button" className="dash-btn dash-btn-danger" onClick={() => rmStation(i)}>Suppr.</button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="dash-btn" style={{ justifySelf: "start" }} onClick={addStation}>+ Ajouter une station</button>
          </div>
        </AccSection>

        {/* 5. Résumé */}
        <AccSection id="resume" label="Sous-sections du résumé" icon={ICONS.text} badge={form.summarySubsections.length} isOpen={openSections.has("resume")} onToggle={toggle}>
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {form.summarySubsections.map((sub, i) => (
              <div key={i} style={{ background: "#faf8fe", border: "1px solid rgba(120,90,160,0.12)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 13 }}>Sous-section {i + 1}</strong>
                  <div className="dash-row-actions">
                    <button type="button" className="dash-btn" onClick={() => mvSum(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="dash-btn" onClick={() => mvSum(i, 1)} disabled={i === form.summarySubsections.length - 1}>↓</button>
                    <button type="button" className="dash-btn dash-btn-danger" onClick={() => rmSum(i)}>Suppr.</button>
                  </div>
                </div>
                <div className="dash-field-col">
                  <input className="dash-input" placeholder="Titre" value={sub.title} onChange={(e) => updSum(i, "title", e.target.value)} />
                  <textarea className="dash-input" rows={4} placeholder="Texte descriptif" value={sub.text} onChange={(e) => updSum(i, "text", e.target.value)} style={{ resize: "vertical" }} />
                  <div className="dash-copy-field">
                    <input className="dash-input" placeholder="URL image" value={sub.imageSrc} onChange={(e) => updSum(i, "imageSrc", e.target.value)} />
                    <button type="button" className="dash-btn" onClick={() => openPicker({ type: "summary", index: i })}>Choisir</button>
                  </div>
                  {sub.imageSrc && (
                    <img src={sub.imageSrc} alt={sub.title} style={{ width: 200, height: 130, objectFit: "cover", borderRadius: 8 }} />
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="dash-btn" style={{ justifySelf: "start" }} onClick={addSum}>+ Ajouter une sous-section</button>
          </div>
        </AccSection>

        {/* 6. Sections détaillées */}
        <AccSection id="sections" label="Sections détaillées de la page" icon={ICONS.sections} badge={form.sections.length} isOpen={openSections.has("sections")} onToggle={toggle}>
          <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
            {form.sections.map((section, si) => (
              <div key={si} style={{ background: "#faf8fe", border: "1px solid rgba(120,90,160,0.12)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <strong style={{ fontSize: 13 }}>Section {si + 1}</strong>
                  <div className="dash-row-actions">
                    <button type="button" className="dash-btn" onClick={() => mvSection(si, -1)} disabled={si === 0}>↑</button>
                    <button type="button" className="dash-btn" onClick={() => mvSection(si, 1)} disabled={si === form.sections.length - 1}>↓</button>
                    <button type="button" className="dash-btn dash-btn-danger" onClick={() => rmSection(si)}>Suppr. section</button>
                  </div>
                </div>
                {(section.subSections || []).map((sub, subi) => (
                  <div key={subi} style={{ marginBottom: 10, border: "1px dashed rgba(120,90,160,0.2)", borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--dash-muted)", fontWeight: 600 }}>Sous-section {subi + 1}</span>
                      <div className="dash-row-actions">
                        <button type="button" className="dash-btn" style={{ height: 28, fontSize: 12 }} onClick={() => mvSub(si, subi, -1)} disabled={subi === 0}>↑</button>
                        <button type="button" className="dash-btn" style={{ height: 28, fontSize: 12 }} onClick={() => mvSub(si, subi, 1)} disabled={subi === (section.subSections || []).length - 1}>↓</button>
                        <button type="button" className="dash-btn dash-btn-danger" style={{ height: 28, fontSize: 12 }} onClick={() => rmSub(si, subi)}>×</button>
                      </div>
                    </div>
                    <div className="dash-field-col">
                      <input className="dash-input" placeholder="Titre sous-section" value={sub.title} onChange={(e) => updSub(si, subi, "title", e.target.value)} />
                      <textarea className="dash-input" rows={3} placeholder="Texte" value={sub.text} onChange={(e) => updSub(si, subi, "text", e.target.value)} style={{ resize: "vertical" }} />
                      <div className="dash-copy-field">
                        <input className="dash-input" placeholder="URL image" value={sub.imageSrc} onChange={(e) => updSub(si, subi, "imageSrc", e.target.value)} />
                        <button type="button" className="dash-btn" onClick={() => openPicker({ type: "sectionSub", si, subi })}>Choisir</button>
                      </div>
                      {sub.imageSrc && (
                        <img src={sub.imageSrc} alt={sub.title} style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 8 }} />
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" className="dash-btn" style={{ fontSize: 12, height: 30 }} onClick={() => addSub(si)}>+ Sous-section</button>
              </div>
            ))}
            <button type="button" className="dash-btn" style={{ justifySelf: "start" }} onClick={addSection}>+ Ajouter une section</button>
          </div>
        </AccSection>

        {/* 7. Galerie */}
        <AccSection id="galerie" label="Galerie photos" icon={ICONS.gallery} badge={form.galleryImages.length || null} isOpen={openSections.has("galerie")} onToggle={toggle}>
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="dash-btn" onClick={() => openPicker({ type: "gallery" })}>
                Ajouter depuis la photothèque
              </button>
              <button type="button" className="dash-btn" onClick={() => openPicker({ type: "gallery", multi: true })}>
                Ajouter plusieurs photos
              </button>
              <span className="dash-muted" style={{ fontSize: 13 }}>{form.galleryImages.length} image(s)</span>
            </div>
            <div className="dash-copy-field">
              <input className="dash-input" value={customGallery} onChange={(e) => setCustomGallery(e.target.value)} placeholder="Ou coller une URL d'image directement" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGalleryUrl())} />
              <button type="button" className="dash-btn" onClick={addGalleryUrl}>Ajouter</button>
            </div>
            {form.galleryImages.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                {form.galleryImages.map((item, i) => {
                  const src = galleryItemSrc(item);
                  if (!src) return null;
                  const key = typeof item === "object" ? `${item.photoId || item.id || src}-${i}` : `${src}-${i}`;
                  return (
                  <div key={key} style={{ position: "relative", borderRadius: 10, overflow: "hidden", boxShadow: "var(--dash-shadow)" }}>
                    <img src={src} alt={`galerie ${i + 1}`} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                    <div style={{ position: "absolute", inset: 0, background: "rgba(20,16,42,0)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 6, opacity: 0, transition: "opacity 0.15s" }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                    >
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button type="button" className="dash-icon-btn" style={{ background: "rgba(255,255,255,0.9)" }} onClick={() => mvGallery(i, -1)} disabled={i === 0}>←</button>
                        <button type="button" className="dash-icon-btn" style={{ background: "rgba(255,255,255,0.9)" }} onClick={() => mvGallery(i, 1)} disabled={i === form.galleryImages.length - 1}>→</button>
                      </div>
                      <button type="button" className="dash-icon-btn" style={{ background: "#fff", alignSelf: "flex-end" }} onClick={() => rmGallery(i)}>×</button>
                    </div>
                    <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(255,255,255,0.9)", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "2px 6px" }}>{i + 1}</div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </AccSection>

        {/* 8. JSON avancé */}
        <AccSection id="avance" label="Champs avancés (JSON)" icon={ICONS.code} isOpen={openSections.has("avance")} onToggle={toggle}>
          <div style={{ marginTop: 14 }}>
            <p className="dash-muted" style={{ fontSize: 12, marginBottom: 8 }}>Champs supplémentaires non exposés dans l'interface. JSON valide uniquement.</p>
            <textarea className="dash-input" rows={10} value={form.extraJson} onChange={(e) => set("extraJson", e.target.value)} style={{ fontFamily: "monospace", fontSize: 12, resize: "vertical" }} />
          </div>
        </AccSection>
      </div>

      {/* ── Photo picker ── */}
      <PhotoPicker
        isOpen={pickerOpen}
        onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
        onSelect={(value) => { applyPicker(value); }}
        multi={Boolean(pickerTarget?.multi)}
        title="Choisir une photo"
      />
    </div>
  );
}
