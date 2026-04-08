"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import Modal from "@/src/components/dashboard/ui/Modal";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const KNOWN_KEYS = new Set([
  "name",
  "heroSubtitle",
  "heroImage",
  "environment",
  "basePrice",
  "ageGroups",
  "dates",
  "stations",
  "summarySubsections",
  "sections",
  "galleryImages",
  "createdAt",
  "updatedAt",
]);

const EMPTY_FORM = {
  name: "",
  heroSubtitle: "",
  heroImage: "",
  environment: "",
  basePrice: 0,
  ageGroups: [],
  dates: [{ startDate: "", endDate: "", basePrice: 0 }],
  stations: [{ name: "Sur Place", priceExtra: 0 }],
  summarySubsections: [{ title: "", text: "", imageSrc: "" }],
  sections: [{ subSections: [{ title: "", text: "", imageSrc: "" }] }],
  galleryImages: [],
  extraJson: "{}",
};

function toPretty(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function uniqUrls(list) {
  return Array.from(new Set((list || []).map((x) => String(x || "").trim()).filter(Boolean)));
}

function normalizeSejour(item) {
  const extra = Object.fromEntries(Object.entries(item || {}).filter(([key]) => !KNOWN_KEYS.has(key)));

  return {
    name: item?.name || "",
    heroSubtitle: item?.heroSubtitle || "",
    heroImage: item?.heroImage || "",
    environment: item?.environment || "",
    basePrice: Number(item?.basePrice || 0),
    ageGroups: Array.isArray(item?.ageGroups) ? item.ageGroups.map((x) => String(x || "").trim()).filter(Boolean) : [],
    dates:
      Array.isArray(item?.dates) && item.dates.length
        ? item.dates.map((d) => ({
            startDate: String(d?.startDate || ""),
            endDate: String(d?.endDate || ""),
            basePrice: Number(d?.basePrice || d?.price || d?.tarif || 0),
          }))
        : [{ startDate: "", endDate: "", basePrice: 0 }],
    stations:
      Array.isArray(item?.stations) && item.stations.length
        ? item.stations.map((s) => ({ name: String(s?.name || ""), priceExtra: Number(s?.priceExtra || 0) }))
        : [{ name: "Sur Place", priceExtra: 0 }],
    summarySubsections:
      Array.isArray(item?.summarySubsections) && item.summarySubsections.length
        ? item.summarySubsections.map((s) => ({ title: s?.title || "", text: s?.text || "", imageSrc: s?.imageSrc || "" }))
        : [{ title: "", text: "", imageSrc: "" }],
    sections:
      Array.isArray(item?.sections) && item.sections.length
        ? item.sections.map((section) => ({
            subSections:
              Array.isArray(section?.subSections) && section.subSections.length
                ? section.subSections.map((sub) => ({ title: sub?.title || "", text: sub?.text || "", imageSrc: sub?.imageSrc || "" }))
                : [{ title: "", text: "", imageSrc: "" }],
          }))
        : [{ subSections: [{ title: "", text: "", imageSrc: "" }] }],
    galleryImages: uniqUrls(item?.galleryImages || []),
    extraJson: toPretty(extra),
  };
}

function formatDateInput(value) {
  const v = String(value || "");
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value) {
  const v = String(value || "");
  if (!v) return "";
  return `${v}T00:00:00.000Z`;
}

function isUpcoming(item) {
  const rawDates = item?.dates || [];
  return rawDates.some((d) => {
    const start = String(d?.startDate || "");
    return start.startsWith("2026") || start.startsWith("2027") || start.startsWith("2028");
  });
}

export default function Sejours() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [library, setLibrary] = useState([]);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);

  const [newAgeGroup, setNewAgeGroup] = useState("");
  const [customGalleryUrl, setCustomGalleryUrl] = useState("");

  const { showToast } = useToast();

  const loadSejours = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.SEJOURS), orderBy("name", "asc")));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      showToast("Erreur de chargement des séjours", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadLibrary = async () => {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.PHOTOS));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x?.url)
        .sort((a, b) => `${a.album || ""}/${a.nom || ""}`.localeCompare(`${b.album || ""}/${b.nom || ""}`, "fr"));
      setLibrary(list);
    } catch {
      showToast("Erreur de chargement de la photothèque", "error");
    }
  };

  useEffect(() => {
    loadSejours();
    loadLibrary();
  }, []);

  const filteredLibrary = useMemo(() => {
    const q = libraryFilter.trim().toLowerCase();
    if (!q) return library;
    return library.filter((img) => `${img.nom || ""} ${img.album || ""} ${img.storagePath || ""}`.toLowerCase().includes(q));
  }, [library, libraryFilter]);

  const upcoming = useMemo(() => items.filter(isUpcoming), [items]);
  const past = useMemo(() => items.filter((x) => !isUpcoming(x)), [items]);

  const onCreate = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setNewAgeGroup("");
    setCustomGalleryUrl("");
    setOpen(true);
  };

  const onEdit = (item) => {
    setSelectedId(item.id);
    setForm(normalizeSejour(item));
    setNewAgeGroup("");
    setCustomGalleryUrl("");
    setOpen(true);
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateDate = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.dates];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, dates: next };
    });
  };

  const addDate = () => {
    setForm((prev) => ({ ...prev, dates: [...prev.dates, { startDate: "", endDate: "", basePrice: 0 }] }));
  };

  const removeDate = (index) => {
    setForm((prev) => ({ ...prev, dates: prev.dates.filter((_, i) => i !== index) }));
  };

  const updateStation = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.stations];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, stations: next };
    });
  };

  const addStation = () => {
    setForm((prev) => ({ ...prev, stations: [...prev.stations, { name: "", priceExtra: 0 }] }));
  };

  const removeStation = (index) => {
    setForm((prev) => ({ ...prev, stations: prev.stations.filter((_, i) => i !== index) }));
  };

  const addAgeGroup = () => {
    const value = newAgeGroup.trim();
    if (!value) return;
    setForm((prev) => ({ ...prev, ageGroups: uniqUrls([...prev.ageGroups, value]) }));
    setNewAgeGroup("");
  };

  const removeAgeGroup = (value) => {
    setForm((prev) => ({ ...prev, ageGroups: prev.ageGroups.filter((x) => x !== value) }));
  };

  const updateSummarySub = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.summarySubsections];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, summarySubsections: next };
    });
  };

  const addSummarySub = () => {
    setForm((prev) => ({ ...prev, summarySubsections: [...prev.summarySubsections, { title: "", text: "", imageSrc: "" }] }));
  };

  const removeSummarySub = (index) => {
    setForm((prev) => ({ ...prev, summarySubsections: prev.summarySubsections.filter((_, i) => i !== index) }));
  };

  const addSection = () => {
    setForm((prev) => ({ ...prev, sections: [...prev.sections, { subSections: [{ title: "", text: "", imageSrc: "" }] }] }));
  };

  const removeSection = (sectionIndex) => {
    setForm((prev) => ({ ...prev, sections: prev.sections.filter((_, i) => i !== sectionIndex) }));
  };

  const addSectionSub = (sectionIndex) => {
    setForm((prev) => {
      const sections = [...prev.sections];
      const section = sections[sectionIndex] || { subSections: [] };
      section.subSections = [...(section.subSections || []), { title: "", text: "", imageSrc: "" }];
      sections[sectionIndex] = section;
      return { ...prev, sections };
    });
  };

  const removeSectionSub = (sectionIndex, subIndex) => {
    setForm((prev) => {
      const sections = [...prev.sections];
      const section = sections[sectionIndex] || { subSections: [] };
      section.subSections = (section.subSections || []).filter((_, i) => i !== subIndex);
      sections[sectionIndex] = section;
      return { ...prev, sections };
    });
  };

  const updateSectionSub = (sectionIndex, subIndex, key, value) => {
    setForm((prev) => {
      const sections = [...prev.sections];
      const section = sections[sectionIndex] || { subSections: [] };
      const subSections = [...(section.subSections || [])];
      subSections[subIndex] = { ...subSections[subIndex], [key]: value };
      section.subSections = subSections;
      sections[sectionIndex] = section;
      return { ...prev, sections };
    });
  };

  const addCustomGalleryUrl = () => {
    const url = customGalleryUrl.trim();
    if (!url) return;
    if (!url.startsWith("/") && !url.startsWith("http")) {
      showToast("URL invalide: utiliser /... ou https://...", "warning");
      return;
    }
    setForm((prev) => ({ ...prev, galleryImages: uniqUrls([...(prev.galleryImages || []), url]) }));
    setCustomGalleryUrl("");
  };

  const removeGalleryUrl = (url) => {
    setForm((prev) => ({ ...prev, galleryImages: prev.galleryImages.filter((x) => x !== url) }));
  };

  const openPicker = (target) => {
    setPickerTarget(target);
    setPickerOpen(true);
  };

  const applyPickerUrl = (url) => {
    if (!pickerTarget) return;

    if (pickerTarget.type === "hero") {
      setForm((prev) => ({ ...prev, heroImage: url }));
    }

    if (pickerTarget.type === "gallery") {
      setForm((prev) => ({ ...prev, galleryImages: uniqUrls([...(prev.galleryImages || []), url]) }));
    }

    if (pickerTarget.type === "summary") {
      updateSummarySub(pickerTarget.index, "imageSrc", url);
    }

    if (pickerTarget.type === "sectionSub") {
      updateSectionSub(pickerTarget.sectionIndex, pickerTarget.subIndex, "imageSrc", url);
    }

    setPickerOpen(false);
    setPickerTarget(null);
  };

  const onSave = async () => {
    let extraFields = {};
    try {
      extraFields = JSON.parse(form.extraJson || "{}");
    } catch {
      showToast("JSON avancé invalide", "error");
      return;
    }

    const payload = {
      ...extraFields,
      name: form.name.trim() || "Séjour",
      heroSubtitle: form.heroSubtitle,
      heroImage: form.heroImage,
      environment: form.environment,
      basePrice: Number(form.basePrice || 0),
      ageGroups: form.ageGroups,
      dates: form.dates.map((d) => ({
        startDate: toIsoDate(formatDateInput(d.startDate)),
        endDate: toIsoDate(formatDateInput(d.endDate)),
        basePrice: Number(d.basePrice || 0),
      })),
      stations: form.stations.map((s) => ({ name: s.name, priceExtra: Number(s.priceExtra || 0) })),
      summarySubsections: form.summarySubsections,
      sections: form.sections,
      galleryImages: uniqUrls(form.galleryImages),
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (selectedId) {
        await updateDoc(doc(db, COLLECTIONS.SEJOURS, selectedId), payload);
      } else {
        await addDoc(collection(db, COLLECTIONS.SEJOURS), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      showToast("Séjour sauvegardé", "success");
      setOpen(false);
      loadSejours();
    } catch {
      showToast("Erreur de sauvegarde du séjour", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (item) => {
    if (!window.confirm(`Supprimer ${item.name || "ce séjour"} ?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.SEJOURS, item.id));
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      showToast("Séjour supprimé", "success");
    } catch {
      showToast("Erreur de suppression du séjour", "error");
    }
  };

  const renderList = (title, list) => (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>{title}</h2>
      </div>
      <div className="dash-list-cards">
        {!list.length ? <p className="dash-muted">Aucun élément.</p> : null}
        {list.map((sejour) => (
          <article key={sejour.id} className="dash-list-card">
            <img src={sejour.heroImage || "/load.png"} alt={sejour.name || "Séjour"} width={60} height={60} />
            <div className="dash-list-card-main">
              <h3>{sejour.name || "Sans titre"}</h3>
              <p>{sejour.heroSubtitle || "-"}</p>
              <small>
                {sejour.environment || "-"} · {Number(sejour.basePrice || 0)} € · {Array.isArray(sejour.galleryImages) ? sejour.galleryImages.length : 0} photos
              </small>
            </div>
            <span className="dash-inline-status">{sejour.id}</span>
            <div className="dash-row-actions">
              <button type="button" className="dash-btn" onClick={() => onEdit(sejour)}>
                Éditer
              </button>
              <button type="button" className="dash-btn" onClick={() => onDelete(sejour)}>
                Supprimer
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Séjours (live)</h1>
          <p>CRUD complet: sections, sous-sections, photos, tarifs, dates et transports.</p>
        </div>
        <button type="button" className="dash-btn dash-btn-primary" onClick={onCreate}>
          Ajouter un séjour
        </button>
      </header>

      {loading ? <p className="dash-muted">Chargement...</p> : renderList("Séjours à venir", upcoming)}
      {!loading ? renderList("Séjours passés", past) : null}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={selectedId ? "Éditer le séjour" : "Créer un séjour"} size="lg">
        <div className="dash-form-grid">
          <label>Nom<input className="dash-input" value={form.name} onChange={(e) => updateField("name", e.target.value)} /></label>
          <label>Sous-titre héros<input className="dash-input" value={form.heroSubtitle} onChange={(e) => updateField("heroSubtitle", e.target.value)} /></label>
          <label>Environnement<input className="dash-input" value={form.environment} onChange={(e) => updateField("environment", e.target.value)} /></label>
          <label>Prix de base<input className="dash-input" type="number" value={form.basePrice} onChange={(e) => updateField("basePrice", Number(e.target.value))} /></label>
          <label className="dash-span-2">Image héros
            <div className="dash-copy-field">
              <input className="dash-input" value={form.heroImage} onChange={(e) => updateField("heroImage", e.target.value)} />
              <button type="button" className="dash-btn" onClick={() => openPicker({ type: "hero" })}>Choisir</button>
            </div>
          </label>
        </div>

        <div className="dash-field-col" style={{ marginTop: 14 }}>
          <label>Tranches d'âge</label>
          <div className="dash-copy-field">
            <input className="dash-input" value={newAgeGroup} onChange={(e) => setNewAgeGroup(e.target.value)} placeholder="ex: 11-13" />
            <button type="button" className="dash-btn" onClick={addAgeGroup}>Ajouter</button>
          </div>
          <div className="dash-row-actions" style={{ flexWrap: "wrap" }}>
            {form.ageGroups.map((age) => (
              <button key={age} type="button" className="dash-btn" onClick={() => removeAgeGroup(age)}>
                {age} ×
              </button>
            ))}
          </div>
        </div>

        <div className="dash-field-col" style={{ marginTop: 14 }}>
          <label>Dates et prix par période</label>
          {form.dates.map((dateItem, index) => (
            <div key={`date-${index}`} className="dash-form-grid" style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <label>Début<input type="date" className="dash-input" value={formatDateInput(dateItem.startDate)} onChange={(e) => updateDate(index, "startDate", e.target.value)} /></label>
              <label>Fin<input type="date" className="dash-input" value={formatDateInput(dateItem.endDate)} onChange={(e) => updateDate(index, "endDate", e.target.value)} /></label>
              <label>Prix période<input type="number" className="dash-input" value={dateItem.basePrice} onChange={(e) => updateDate(index, "basePrice", Number(e.target.value))} /></label>
              <div style={{ display: "flex", alignItems: "end" }}>
                <button type="button" className="dash-btn" onClick={() => removeDate(index)}>Supprimer</button>
              </div>
            </div>
          ))}
          <button type="button" className="dash-btn" onClick={addDate}>Ajouter une période</button>
        </div>

        <div className="dash-field-col" style={{ marginTop: 14 }}>
          <label>Stations / Transport</label>
          {form.stations.map((station, index) => (
            <div key={`station-${index}`} className="dash-form-grid" style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <label>Nom station<input className="dash-input" value={station.name} onChange={(e) => updateStation(index, "name", e.target.value)} /></label>
              <label>Surcoût (€)<input type="number" className="dash-input" value={station.priceExtra} onChange={(e) => updateStation(index, "priceExtra", Number(e.target.value))} /></label>
              <div style={{ display: "flex", alignItems: "end" }}>
                <button type="button" className="dash-btn" onClick={() => removeStation(index)}>Supprimer</button>
              </div>
            </div>
          ))}
          <button type="button" className="dash-btn" onClick={addStation}>Ajouter une station</button>
        </div>

        <div className="dash-field-col" style={{ marginTop: 14 }}>
          <label>Sous-sections du résumé</label>
          {form.summarySubsections.map((sub, index) => (
            <div key={`summary-${index}`} className="dash-field-col" style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <input className="dash-input" placeholder="Titre" value={sub.title} onChange={(e) => updateSummarySub(index, "title", e.target.value)} />
              <textarea className="dash-input" rows="4" placeholder="Texte" value={sub.text} onChange={(e) => updateSummarySub(index, "text", e.target.value)} />
              <div className="dash-copy-field">
                <input className="dash-input" placeholder="Image URL" value={sub.imageSrc} onChange={(e) => updateSummarySub(index, "imageSrc", e.target.value)} />
                <button type="button" className="dash-btn" onClick={() => openPicker({ type: "summary", index })}>Choisir</button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="dash-btn" onClick={() => removeSummarySub(index)}>Supprimer</button>
              </div>
            </div>
          ))}
          <button type="button" className="dash-btn" onClick={addSummarySub}>Ajouter une sous-section résumé</button>
        </div>

        <div className="dash-field-col" style={{ marginTop: 14 }}>
          <label>Sections détaillées</label>
          {form.sections.map((section, sectionIndex) => (
            <div key={`section-${sectionIndex}`} className="dash-field-col" style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Section {sectionIndex + 1}</strong>
                <button type="button" className="dash-btn" onClick={() => removeSection(sectionIndex)}>Supprimer section</button>
              </div>

              {(section.subSections || []).map((sub, subIndex) => (
                <div key={`section-${sectionIndex}-sub-${subIndex}`} className="dash-field-col" style={{ border: "1px dashed #ddd", borderRadius: 10, padding: 10 }}>
                  <input className="dash-input" placeholder="Titre sous-section" value={sub.title} onChange={(e) => updateSectionSub(sectionIndex, subIndex, "title", e.target.value)} />
                  <textarea className="dash-input" rows="4" placeholder="Texte sous-section" value={sub.text} onChange={(e) => updateSectionSub(sectionIndex, subIndex, "text", e.target.value)} />
                  <div className="dash-copy-field">
                    <input className="dash-input" placeholder="Image URL" value={sub.imageSrc} onChange={(e) => updateSectionSub(sectionIndex, subIndex, "imageSrc", e.target.value)} />
                    <button type="button" className="dash-btn" onClick={() => openPicker({ type: "sectionSub", sectionIndex, subIndex })}>Choisir</button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" className="dash-btn" onClick={() => removeSectionSub(sectionIndex, subIndex)}>Supprimer sous-section</button>
                  </div>
                </div>
              ))}

              <button type="button" className="dash-btn" onClick={() => addSectionSub(sectionIndex)}>Ajouter une sous-section</button>
            </div>
          ))}
          <button type="button" className="dash-btn" onClick={addSection}>Ajouter une section</button>
        </div>

        <div className="dash-field-col" style={{ marginTop: 14 }}>
          <label>Galerie du séjour</label>
          <div className="dash-copy-field">
            <input className="dash-input" value={customGalleryUrl} onChange={(e) => setCustomGalleryUrl(e.target.value)} placeholder="Ajouter une URL image" />
            <button type="button" className="dash-btn" onClick={addCustomGalleryUrl}>Ajouter</button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="dash-btn" onClick={() => openPicker({ type: "gallery" })}>Ajouter depuis photothèque</button>
            <span className="dash-muted">{form.galleryImages.length} image(s) sélectionnée(s)</span>
          </div>

          <div className="dash-media-grid" style={{ gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 8 }}>
            {form.galleryImages.map((url) => (
              <div key={url} className="dash-media-card" style={{ position: "relative" }}>
                <img src={url} alt="galerie" />
                <button
                  type="button"
                  className="dash-icon-btn"
                  onClick={() => removeGalleryUrl(url)}
                  style={{ position: "absolute", top: 6, right: 6, background: "#fff" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="dash-field-col" style={{ marginTop: 14 }}>
          JSON avancé (champs non exposés)
          <textarea className="dash-input" rows="10" value={form.extraJson} onChange={(e) => updateField("extraJson", e.target.value)} />
        </label>

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={() => setOpen(false)}>Fermer</button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Sauvegarder"}
          </button>
        </div>
      </Modal>

      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Choisir une photo" size="lg">
        <div className="dash-field-col">
          <input
            className="dash-input"
            value={libraryFilter}
            onChange={(e) => setLibraryFilter(e.target.value)}
            placeholder="Filtrer la photothèque (nom/album)"
          />
          <div className="dash-media-grid" style={{ maxHeight: 420, overflowY: "auto" }}>
            {filteredLibrary.map((img) => (
              <button
                key={img.id}
                type="button"
                className="dash-media-card"
                onClick={() => applyPickerUrl(img.url)}
                title={`${img.album || ""} / ${img.nom || ""}`}
              >
                <img src={img.url} alt={img.nom || "photo"} />
                <p>{img.nom || "photo"}</p>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
