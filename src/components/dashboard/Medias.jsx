"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import Image from "next/image";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { useToast } from "@/src/contexts/ToastContext";
import { fetchAllPhotos, invalidatePhotosCache, updatePhotosCache } from "@/src/lib/photosCache";
import Modal from "@/src/components/dashboard/ui/Modal";

const SLICE_SIZE = 48;

/* ─── helpers ────────────────────────────────────────────────────────── */
function normalizeFilename(name) {
  return String(name || "photo")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9._/-]/g, "")
    || "photo";
}

function sizeLabel(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

/* ─── Compression image côté client ─────────────────────────────────── */
const COMPRESS_THRESHOLD = 3 * 1024 * 1024;
const COMPRESS_TARGET    = 4.5 * 1024 * 1024;
const COMPRESS_MAX_PX    = 2400;
const COMPRESS_QUALITIES = [0.85, 0.80, 0.75, 0.72];

function compressImage(file) {
  if (file.size <= COMPRESS_THRESHOLD) return Promise.resolve(file);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return Promise.resolve(file);
  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > COMPRESS_MAX_PX || h > COMPRESS_MAX_PX) {
        const ratio = Math.min(COMPRESS_MAX_PX / w, COMPRESS_MAX_PX / h);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      let idx = 0;
      const tryNext = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= COMPRESS_TARGET || idx >= COMPRESS_QUALITIES.length - 1) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else { idx++; tryNext(); }
        }, "image/jpeg", COMPRESS_QUALITIES[idx]);
      };
      tryNext();
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

/* ─── Icônes SVG inline ──────────────────────────────────────────────── */
const IcoRename = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M11 2l3 3-9 9H2v-3L11 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoTrash = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoPlus = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IcoChevron = ({ open }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d={open ? "M2 7l3-4 3 4" : "M2 3l3 4 3-4"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoFolder = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.3 1.2H13A1.5 1.5 0 0 1 14.5 5.7v5.8A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);
const IcoClose = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* ─── AlbumPicker : select propre avec sous-albums ───────────────────── */
function AlbumPicker({ value, onChange, albums, albumTree, style, placeholder }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal]   = useState("");
  const parents = Object.keys(albumTree).sort((a, b) => a.localeCompare(b, "fr"));

  if (showCustom) {
    return (
      <div style={{ display: "flex", gap: 6, ...style }}>
        <input autoFocus className="dash-input" style={{ flex: 1 }}
          value={customVal} placeholder="surf/session-été  ou  nouvel-album"
          onChange={(e) => setCustomVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customVal.trim()) { onChange(customVal.trim()); setShowCustom(false); }
            if (e.key === "Escape") setShowCustom(false);
          }}
        />
        <button type="button" className="dash-btn dash-btn-primary" style={{ flexShrink: 0 }}
          onClick={() => { if (customVal.trim()) { onChange(customVal.trim()); setShowCustom(false); } }}>OK</button>
        <button type="button" className="dash-btn" style={{ flexShrink: 0 }} onClick={() => setShowCustom(false)}>✕</button>
      </div>
    );
  }

  return (
    <select className="dash-select" value={value} style={style}
      onChange={(e) => {
        if (e.target.value === "__new__") { setShowCustom(true); setCustomVal(""); }
        else onChange(e.target.value);
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {value && !albums.includes(value) && value !== "" && (
        <option value={value}>{value} (nouveau)</option>
      )}
      {parents.map((parent) => {
        const subs = albumTree[parent].filter((c) => c !== parent).slice().sort();
        if (subs.length === 0) return <option key={parent} value={parent}>{parent}</option>;
        return (
          <optgroup key={parent} label={`📁 ${parent}`}>
            {albumTree[parent].includes(parent) && (
              <option value={parent}>{parent} — tout l&apos;album</option>
            )}
            {subs.map((c) => (
              <option key={c} value={c}>↳ {c.split("/").slice(1).join("/")}</option>
            ))}
          </optgroup>
        );
      })}
      <option value="__new__">+ Créer un album…</option>
    </select>
  );
}

/* ─── Component ──────────────────────────────────────────────────────── */
export default function Medias() {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const sentinelRef  = useRef(null);

  /* ── state ── */
  const [tab,           setTab]           = useState("library");
  const [photos,        setPhotos]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState("all");
  const [search,        setSearch]        = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const [sliceEnd,      setSliceEnd]      = useState(SLICE_SIZE);

  /* Albums sidebar */
  const [expandedParents,  setExpandedParents]  = useState(new Set());
  const [albumModal,       setAlbumModal]       = useState(null); // { type: "create"|"rename"|"sub", album?: string, parent?: string }
  const [albumModalValue,  setAlbumModalValue]  = useState("");
  const [albumSubmitting,  setAlbumSubmitting]  = useState(false);

  /* Delete album modal */
  const [deleteAlbumTarget, setDeleteAlbumTarget] = useState(null);
  const [deleteAlbumMode,   setDeleteAlbumMode]   = useState("reassign"); // "reassign" | "delete"
  const [deleteAlbumDest,   setDeleteAlbumDest]   = useState("");
  const [deletingAlbum,     setDeletingAlbum]     = useState(false);

  /* Multi-selection */
  const [selectionMode,   setSelectionMode]   = useState(false);
  const [selectedIds,     setSelectedIds]     = useState(new Set());
  const [moveAlbumTarget, setMoveAlbumTarget] = useState("");
  const [moveModalOpen,   setMoveModalOpen]   = useState(false);
  const [moving,          setMoving]          = useState(false);
  const [deletingMultiple, setDeletingMultiple] = useState(false);

  /* Upload */
  const [uploadAlbum, setUploadAlbum] = useState("banqueimage");
  const [queue,       setQueue]       = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [dragOver,    setDragOver]    = useState(false);

  /* ── load photos ── */
  const loadPhotos = useCallback(async (force = false) => {
    setLoading(true);
    if (force) invalidatePhotosCache();
    try { setPhotos(await fetchAllPhotos()); }
    catch { showToast("Erreur de chargement des photos", "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  /* ── Derived ── */
  const albums = useMemo(() => {
    const set = new Set(photos.map((p) => p.album || "sans-album").filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [photos]);

  const albumTree = useMemo(() => {
    const tree = {};
    albums.forEach((a) => {
      const parent = a.split("/")[0];
      if (!tree[parent]) tree[parent] = [];
      if (!tree[parent].includes(a)) tree[parent].push(a);
    });
    return tree;
  }, [albums]);

  const displayedPhotos = useMemo(() => {
    let list = photos;
    if (selectedAlbum !== "all") {
      list = list.filter((p) => {
        const a = p.album || "sans-album";
        return a === selectedAlbum || a.startsWith(selectedAlbum + "/");
      });
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => `${p.nom || ""} ${p.album || ""}`.toLowerCase().includes(q));
    return list;
  }, [photos, selectedAlbum, search]);

  useEffect(() => { setSliceEnd(SLICE_SIZE); }, [selectedAlbum, search]);

  const visiblePhotos = displayedPhotos.slice(0, sliceEnd);
  const hasMore = sliceEnd < displayedPhotos.length;

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setSliceEnd((s) => s + SLICE_SIZE); },
      { rootMargin: "400px" }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, visiblePhotos.length]);

  /* ── Copy URL ── */
  const copyUrl = async (url) => {
    try { await navigator.clipboard.writeText(url); showToast("URL copiée !", "success"); }
    catch { showToast("Impossible de copier", "error"); }
  };

  /* ── Delete single ── */
  const deletePhoto = async (photo) => {
    if (!window.confirm(`Supprimer "${photo.nom || "cette photo"}" ?`)) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.PHOTOS, photo.id));
      if (photo.storagePath) {
        try { await deleteObject(ref(storage, photo.storagePath)); } catch { /* best-effort */ }
      }
      updatePhotosCache((c) => c.filter((p) => p.id !== photo.id));
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
      showToast("Photo supprimée", "success");
    } catch { showToast("Erreur de suppression", "error"); }
    finally { setDeleting(false); }
  };

  /* ── Selection ── */
  const toggleSelect = (id) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds(new Set()); setMoveAlbumTarget(""); };
  const selectAll = () => setSelectedIds(new Set(displayedPhotos.map((p) => p.id)));

  /* ── Delete multiple ── */
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Supprimer définitivement ${selectedIds.size} photo${selectedIds.size > 1 ? "s" : ""} ? Cette action est irréversible.`)) return;
    setDeletingMultiple(true);
    try {
      const toDelete = photos.filter((p) => selectedIds.has(p.id));
      await Promise.all(toDelete.map((p) => deleteDoc(doc(db, COLLECTIONS.PHOTOS, p.id))));
      await Promise.allSettled(toDelete.filter((p) => p.storagePath).map((p) => deleteObject(ref(storage, p.storagePath))));
      updatePhotosCache((c) => c.filter((p) => !selectedIds.has(p.id)));
      setPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      if (selectedPhoto && selectedIds.has(selectedPhoto.id)) setSelectedPhoto(null);
      showToast(`${toDelete.length} photo${toDelete.length > 1 ? "s" : ""} supprimée${toDelete.length > 1 ? "s" : ""}`, "success");
      exitSelectionMode();
    } catch { showToast("Erreur lors de la suppression", "error"); }
    finally { setDeletingMultiple(false); }
  };

  /* ── Move to album ── */
  const moveToAlbum = async (forcedTarget) => {
    const target = String(forcedTarget ?? moveAlbumTarget).trim();
    if (!target || selectedIds.size === 0) return;
    setMoving(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) =>
        updateDoc(doc(db, COLLECTIONS.PHOTOS, id), { album: target })
      ));
      const updater = (c) => c.map((p) => selectedIds.has(p.id) ? { ...p, album: target } : p);
      updatePhotosCache(updater); setPhotos(updater);
      showToast(`${selectedIds.size} photo(s) déplacée(s) vers "${target}"`, "success");
      setSelectedIds(new Set()); setMoveAlbumTarget("");
      setMoveModalOpen(false);
    } catch { showToast("Erreur lors du déplacement", "error"); }
    finally { setMoving(false); }
  };

  const cleanAlbumPath = (value) =>
    String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9/_-]/gi, "")
      .replace(/\/{2,}/g, "/")
      .replace(/^\/|\/$/g, "");

  const cleanSegment = (value) => cleanAlbumPath(value).replace(/\//g, "-");

  const openCreateAlbumModal = () => {
    setAlbumModal({ type: "create" });
    setAlbumModalValue("");
  };

  const openRenameAlbumModal = (album) => {
    setAlbumModal({ type: "rename", album });
    setAlbumModalValue(album);
  };

  const openSubAlbumModal = (parent) => {
    setAlbumModal({ type: "sub", parent });
    setAlbumModalValue("");
  };

  const closeAlbumModal = () => {
    if (albumSubmitting) return;
    setAlbumModal(null);
    setAlbumModalValue("");
  };

  const submitAlbumModal = async () => {
    if (!albumModal) return;

    if (albumModal.type === "create") {
      const name = cleanAlbumPath(albumModalValue);
      if (!name) { showToast("Nom d'album invalide", "warning"); return; }
      setUploadAlbum(name);
      setTab("upload");
      showToast(`Album "${name}" prêt pour l'upload`, "success");
      closeAlbumModal();
      return;
    }

    if (albumModal.type === "sub") {
      const parent = albumModal.parent;
      const suffix = cleanSegment(albumModalValue);
      if (!parent || !suffix) { showToast("Nom du sous-album invalide", "warning"); return; }
      const fullName = `${parent}/${suffix}`;
      setUploadAlbum(fullName);
      setTab("upload");
      showToast(`Sous-album "${fullName}" prêt pour l'upload`, "success");
      closeAlbumModal();
      return;
    }

    if (albumModal.type === "rename") {
      const oldName = albumModal.album;
      const newName = cleanAlbumPath(albumModalValue);
      if (!oldName) return;
      if (!newName || newName === oldName) { closeAlbumModal(); return; }

      setAlbumSubmitting(true);
      try {
        const toUpdate = photos.filter((p) => {
          const a = p.album || "sans-album";
          return a === oldName || a.startsWith(oldName + "/");
        });
        await Promise.all(toUpdate.map((p) => {
          const a = p.album || "sans-album";
          const newAlbum = a === oldName ? newName : newName + a.slice(oldName.length);
          return updateDoc(doc(db, COLLECTIONS.PHOTOS, p.id), { album: newAlbum });
        }));
        const updater = (c) => c.map((p) => {
          const a = p.album || "sans-album";
          if (a === oldName) return { ...p, album: newName };
          if (a.startsWith(oldName + "/")) return { ...p, album: newName + a.slice(oldName.length) };
          return p;
        });
        updatePhotosCache(updater);
        setPhotos(updater);
        if (selectedAlbum === oldName) setSelectedAlbum(newName);
        else if (selectedAlbum.startsWith(oldName + "/")) setSelectedAlbum(newName + selectedAlbum.slice(oldName.length));
        showToast(`Album renommé en "${newName}"`, "success");
        closeAlbumModal();
      } catch {
        showToast("Erreur lors du renommage", "error");
      } finally {
        setAlbumSubmitting(false);
      }
    }
  };

  const openDeleteAlbum = (album) => {
    setDeleteAlbumTarget(album);
    setDeleteAlbumMode("reassign");
    setDeleteAlbumDest("");
  };

  const confirmDeleteAlbum = async () => {
    if (!deleteAlbumTarget) return;
    setDeletingAlbum(true);
    const toProcess = photos.filter((p) => {
      const a = p.album || "sans-album";
      return a === deleteAlbumTarget || a.startsWith(deleteAlbumTarget + "/");
    });
    try {
      if (deleteAlbumMode === "delete") {
        await Promise.all(toProcess.map((p) => deleteDoc(doc(db, COLLECTIONS.PHOTOS, p.id))));
        await Promise.allSettled(toProcess.filter((p) => p.storagePath).map((p) => deleteObject(ref(storage, p.storagePath))));
        updatePhotosCache((c) => c.filter((p) => !toProcess.find((tp) => tp.id === p.id)));
        setPhotos((prev) => prev.filter((p) => !toProcess.find((tp) => tp.id === p.id)));
        if (selectedPhoto && toProcess.find((p) => p.id === selectedPhoto.id)) setSelectedPhoto(null);
        showToast(`${toProcess.length} photo${toProcess.length > 1 ? "s" : ""} supprimée${toProcess.length > 1 ? "s" : ""}`, "success");
      } else {
        const dest = deleteAlbumDest.trim() || "sans-album";
        await Promise.all(toProcess.map((p) => updateDoc(doc(db, COLLECTIONS.PHOTOS, p.id), { album: dest })));
        const updater = (c) => c.map((p) => toProcess.find((tp) => tp.id === p.id) ? { ...p, album: dest } : p);
        updatePhotosCache(updater); setPhotos(updater);
        showToast(`${toProcess.length} photo(s) déplacée(s) vers «${dest}»`, "success");
      }
      if (selectedAlbum === deleteAlbumTarget || selectedAlbum.startsWith(deleteAlbumTarget + "/")) setSelectedAlbum("all");
      setDeleteAlbumTarget(null);
    } catch { showToast("Erreur lors de la suppression de l'album", "error"); }
    finally { setDeletingAlbum(false); }
  };

  /* ── Upload ── */
  const addToQueue = (files) => {
    const accepted = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    const items = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file, compressedFile: null, originalSize: file.size,
      needsCompression: file.size > COMPRESS_THRESHOLD,
      progress: 0, status: file.size > COMPRESS_THRESHOLD ? "compressing" : "pending", url: "",
    }));
    setQueue((prev) => [...prev, ...items]);
    items.forEach(async (item) => {
      if (!item.needsCompression) return;
      try {
        const compressed = await compressImage(item.file);
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, compressedFile: compressed, status: "pending" } : q));
      } catch {
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "pending" } : q));
      }
    });
  };

  const startUpload = async () => {
    if (!queue.length || uploading) return;
    if (queue.some((q) => q.status === "compressing")) { showToast("Compression en cours, patientez…", "info"); return; }
    setUploading(true);
    for (const item of queue) {
      if (item.status === "done") continue;
      const fileToUpload = item.compressedFile || item.file;
      const filename = normalizeFilename(fileToUpload.name || item.file.name);
      const storagePath = `${uploadAlbum}/${Date.now()}-${filename}`;
      const storageRef = ref(storage, storagePath);
      await new Promise((resolve) => {
        const task = uploadBytesResumable(storageRef, fileToUpload);
        task.on("state_changed",
          (snap) => {
            const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
            setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: pct, status: "uploading" } : q));
          },
          () => { setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "error" } : q)); resolve(); },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            try {
              const docRef = await addDoc(collection(db, COLLECTIONS.PHOTOS), {
                nom: filename, album: uploadAlbum, url, storagePath,
                dateAjout: serverTimestamp(), taille: fileToUpload.size || 0, ordre: 0,
              });
              const newPhoto = { id: docRef.id, nom: filename, album: uploadAlbum, url, storagePath, taille: fileToUpload.size || 0 };
              updatePhotosCache((c) => [newPhoto, ...c]);
              setPhotos((prev) => [newPhoto, ...prev]);
            } catch { /* best-effort */ }
            setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: 100, status: "done", url } : q));
            resolve();
          },
        );
      });
    }
    setUploading(false);
    showToast("Upload terminé !", "success");
  };

  const clearDone = () => setQueue((prev) => prev.filter((q) => q.status !== "done"));

  /* ── Sidebar album ── */
  const albumCountFor = (albumName) =>
    photos.filter((p) => { const a = p.album || "sans-album"; return a === albumName || a.startsWith(albumName + "/"); }).length;

  const albumIsActive = (albumName) => selectedAlbum === albumName || selectedAlbum.startsWith(albumName + "/");
  const selectedParent = selectedAlbum === "all" ? null : String(selectedAlbum).split("/")[0];
  const deleteAlbumPhotos = useMemo(() => {
    if (!deleteAlbumTarget) return [];
    return photos.filter((p) => {
      const a = p.album || "sans-album";
      return a === deleteAlbumTarget || a.startsWith(deleteAlbumTarget + "/");
    });
  }, [photos, deleteAlbumTarget]);

  /* ── Render ── */
  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Médiathèque</h1>
          <p>{photos.length} photo{photos.length !== 1 ? "s" : ""} · {Object.keys(albumTree).length} album{Object.keys(albumTree).length !== 1 ? "s" : ""}</p>
        </div>
        <div className="dash-row-actions">
          <button type="button" className="dash-btn" onClick={() => loadPhotos(true)}>Actualiser</button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => setTab("upload")}>+ Uploader</button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="dash-subtabs">
        <button type="button" className={`dash-subtab ${tab === "library" ? "is-active" : ""}`} onClick={() => setTab("library")}>
          Bibliothèque ({photos.length})
        </button>
        <button type="button" className={`dash-subtab ${tab === "upload" ? "is-active" : ""}`} onClick={() => setTab("upload")}>
          Uploader
        </button>
      </div>

      {/* ── Library ── */}
      {tab === "library" && (
        <div className="dash-medias-layout">

          {/* ── Sidebar albums ── */}
          <aside className="dash-album-sidebar">
            <div className="dash-album-sidebar-head">
              <p className="dash-album-sidebar-title">Albums</p>
              <div className="dash-album-toolbar">
                <button type="button" className="dash-album-tool" onClick={openCreateAlbumModal} title="Creer un album">
                  <IcoPlus /> Album
                </button>
                <button
                  type="button"
                  className="dash-album-tool"
                  onClick={() => selectedParent && openSubAlbumModal(selectedParent)}
                  disabled={!selectedParent}
                  title={selectedParent ? `Creer un sous-album dans "${selectedParent}"` : "S?lectionnez un album parent"}
                >
                  + Sous-album
                </button>
              </div>
              {selectedAlbum !== "all" && (
                <div className="dash-album-context-row">
                  <button type="button" className="dash-album-context-btn" onClick={() => openRenameAlbumModal(selectedAlbum)}>
                    Renommer
                  </button>
                  <button type="button" className="dash-album-context-btn danger" onClick={() => openDeleteAlbum(selectedAlbum)}>
                    Supprimer
                  </button>
                </div>
              )}
            </div>

            <div className={`dash-album-item ${selectedAlbum === "all" ? "is-active" : ""}`}>
              <button className="dash-album-item-btn" onClick={() => setSelectedAlbum("all")}>
                Toutes les photos
              </button>
              <span className="dash-album-count">{photos.length}</span>
            </div>

            <div className="dash-album-divider" />

            {Object.keys(albumTree).sort((a, b) => a.localeCompare(b, "fr")).map((parent) => {
              const subs = albumTree[parent].filter((c) => c !== parent).slice().sort();
              const hasSubs = subs.length > 0;
              const isExp = expandedParents.has(parent);
              const isActive = albumIsActive(parent);
              const count = albumCountFor(parent);

              return (
                <div key={parent}>
                  <div className={`dash-album-item ${isActive ? "is-active" : ""}`}>
                    {hasSubs && (
                      <button
                        type="button"
                        className="dash-album-expand"
                        onClick={() => setExpandedParents((prev) => {
                          const n = new Set(prev);
                          n.has(parent) ? n.delete(parent) : n.add(parent);
                          return n;
                        })}
                        title={isExp ? "Reduire" : "Developper"}
                      >
                        <IcoChevron open={isExp} />
                      </button>
                    )}
                    <button className="dash-album-item-btn" style={{ paddingLeft: hasSubs ? 2 : 14 }} onClick={() => setSelectedAlbum(parent)}>
                      <span className="dash-album-folder-icon" aria-hidden><IcoFolder /></span>
                      {parent}
                    </button>
                    <span className="dash-album-count">{count}</span>
                    <span className="dash-album-actions">
                      <button type="button" className="dash-album-action-btn" title={`Ajouter un sous-album dans "${parent}"`} onClick={() => openSubAlbumModal(parent)}><IcoPlus /></button>
                      <button type="button" className="dash-album-action-btn" title={`Renommer "${parent}"`} onClick={() => openRenameAlbumModal(parent)}><IcoRename /></button>
                      <button type="button" className="dash-album-action-btn danger" title={`Supprimer "${parent}"`} onClick={() => openDeleteAlbum(parent)}><IcoTrash /></button>
                    </span>
                  </div>

                  {isExp && subs.map((child) => {
                    const subName = child.split("/").slice(1).join("/");
                    const subCount = photos.filter((p) => (p.album || "sans-album") === child).length;
                    return (
                      <div key={child} className={`dash-album-item dash-album-sub ${selectedAlbum === child ? "is-active" : ""}`}>
                        <span className="dash-album-sub-arrow">&gt;</span>
                        <button className="dash-album-item-btn" onClick={() => setSelectedAlbum(child)}>{subName}</button>
                        <span className="dash-album-count">{subCount}</span>
                        <span className="dash-album-actions">
                          <button type="button" className="dash-album-action-btn" title={`Renommer "${child}"`} onClick={() => openRenameAlbumModal(child)}><IcoRename /></button>
                          <button type="button" className="dash-album-action-btn danger" title={`Supprimer "${child}"`} onClick={() => openDeleteAlbum(child)}><IcoTrash /></button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </aside>

          {/* ── Contenu principal ── */}
          <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 12 }}>

            {/* Barre recherche + sélection */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input className="dash-input" style={{ maxWidth: 260 }}
                placeholder="Rechercher une photo…"
                value={search} onChange={(e) => setSearch(e.target.value)}
              />
              <span style={{ fontSize: 12, color: "var(--dash-muted)" }}>
                {displayedPhotos.length} photo{displayedPhotos.length !== 1 ? "s" : ""}
                {selectedAlbum !== "all" ? ` dans «${selectedAlbum}»` : ""}
              </span>
              <button type="button"
                className={`dash-btn ${selectionMode ? "dash-btn-primary" : ""}`}
                style={{ marginLeft: "auto", height: 34, fontSize: 13 }}
                onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
              >
                {selectionMode ? `✓ Sélection (${selectedIds.size})` : "Sélectionner"}
              </button>
            </div>

            {/* Toolbar sélection */}
            {selectionMode && (
              <div style={{
                display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                background: "var(--dash-bg-subtle, #f5f3ff)", borderRadius: 10,
                padding: "10px 14px", border: "1px solid var(--dash-border)",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dash-muted)" }}>
                  {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
                </span>
                <button type="button" className="dash-btn" style={{ height: 30, fontSize: 12 }} onClick={selectAll}>Tout sélectionner</button>
                <button type="button" className="dash-btn" style={{ height: 30, fontSize: 12 }} onClick={() => setSelectedIds(new Set())}>Désélectionner</button>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="dash-btn dash-btn-primary"
                    style={{ height: 30, fontSize: 12 }}
                    onClick={() => setMoveModalOpen(true)}
                    disabled={moving || selectedIds.size === 0}
                  >
                    Deplacer vers un album...
                  </button>
                  <button type="button" className="dash-btn dash-btn-danger" style={{ height: 30, fontSize: 12 }}
                    onClick={deleteSelected} disabled={deletingMultiple || selectedIds.size === 0}>
                    {deletingMultiple ? "Suppression…" : `🗑 Supprimer (${selectedIds.size})`}
                  </button>
                </div>
              </div>
            )}

            {/* Grille + détail */}
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {loading ? (
                  <div className="dash-media-grid">
                    {Array.from({ length: 16 }).map((_, i) => (
                      <div key={i} style={{ borderRadius: 12, overflow: "hidden" }}>
                        <div className="dash-skeleton-line" style={{ height: 0, paddingBottom: "100%", borderRadius: 0 }} />
                      </div>
                    ))}
                  </div>
                ) : displayedPhotos.length === 0 ? (
                  <div className="dash-empty-state">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor">
                      <rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/>
                      <path d="m21 16-5-5-4 4-2-2-4 4"/>
                    </svg>
                    <h3>Aucune photo</h3>
                    <p>{search || selectedAlbum !== "all" ? "Essayez d'autres filtres." : "Uploadez vos premières photos !"}</p>
                    <button type="button" className="dash-btn dash-btn-primary" onClick={() => setTab("upload")}>Uploader</button>
                  </div>
                ) : (
                  <>
                    <div className="dash-media-grid">
                      {visiblePhotos.map((photo) => {
                        const isChecked = selectedIds.has(photo.id);
                        const isDetail  = !selectionMode && selectedPhoto?.id === photo.id;
                        return (
                          <button key={photo.id} type="button"
                            className={`dash-media-card ${isDetail || isChecked ? "is-selected" : ""}`}
                            onClick={() => selectionMode ? toggleSelect(photo.id) : setSelectedPhoto(selectedPhoto?.id === photo.id ? null : photo)}
                            style={{ position: "relative" }}
                            title={photo.album ? `${photo.album} / ${photo.nom || "photo"}` : photo.nom || "photo"}
                          >
                            <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", overflow: "hidden", borderRadius: "10px 10px 0 0" }}>
                              <Image src={photo.url} alt={photo.nom || "photo"} fill
                                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 256px"
                                style={{ objectFit: "cover" }} loading="lazy"
                              />
                            </div>
                            {selectionMode && (
                              <span style={{
                                position: "absolute", top: 6, left: 6, width: 20, height: 20, borderRadius: "50%",
                                border: `2px solid ${isChecked ? "var(--dash-primary, #7c3aed)" : "#fff"}`,
                                background: isChecked ? "var(--dash-primary, #7c3aed)" : "rgba(0,0,0,0.35)",
                                display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
                              }}>
                                {isChecked && (
                                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </span>
                            )}
                            {photo.album?.includes("/") && (
                              <span style={{
                                position: "absolute", top: 6, right: 6,
                                background: "rgba(0,0,0,0.5)", color: "#fff",
                                fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                                pointerEvents: "none", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {photo.album.split("/").slice(1).join("/")}
                              </span>
                            )}
                            <p style={{ margin: 0, padding: "5px 8px", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {photo.nom || "photo"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    {hasMore && <div ref={sentinelRef} style={{ height: 1, marginTop: 16 }} aria-hidden />}
                    {!hasMore && displayedPhotos.length > SLICE_SIZE && (
                      <p style={{ textAlign: "center", fontSize: 12, color: "var(--dash-muted)", marginTop: 16 }}>
                        — {displayedPhotos.length} photos —
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Panneau détail */}
              {!selectionMode && selectedPhoto && (
                <div className="dash-photo-detail">
                  <div style={{
                    position: "sticky", top: 0, zIndex: 10,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px 8px", background: "#fff",
                    borderBottom: "1px solid rgba(120,90,160,0.1)",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dash-muted)", letterSpacing: "0.05em" }}>DÉTAIL</span>
                    <button type="button" onClick={() => setSelectedPhoto(null)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, borderRadius: 8,
                        background: "rgba(120,90,160,0.08)", border: "none",
                        cursor: "pointer", color: "var(--dash-muted)",
                      }}
                      title="Fermer" aria-label="Fermer le panneau"
                    >
                      <IcoClose />
                    </button>
                  </div>
                  <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", overflow: "hidden" }}>
                    <Image src={selectedPhoto.url} alt={selectedPhoto.nom || "photo"} fill sizes="320px" style={{ objectFit: "cover" }} priority />
                  </div>
                  <div className="dash-photo-detail-body">
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{selectedPhoto.nom || "Sans nom"}</p>
                      {selectedPhoto.album && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--dash-muted)" }}>
                          {selectedPhoto.album.includes("/")
                            ? `📁 ${selectedPhoto.album.split("/")[0]} › ${selectedPhoto.album.split("/").slice(1).join(" › ")}`
                            : `📁 ${selectedPhoto.album}`}
                        </p>
                      )}
                      {selectedPhoto.taille && (
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--dash-muted)" }}>{sizeLabel(selectedPhoto.taille)}</p>
                      )}
                    </div>
                    <div className="dash-field-col">
                      <label style={{ fontSize: 12, fontWeight: 600 }}>URL</label>
                      <div className="dash-copy-field">
                        <input className="dash-input" style={{ fontSize: 11 }} value={selectedPhoto.url} readOnly />
                        <button type="button" className="dash-btn" onClick={() => copyUrl(selectedPhoto.url)}>Copier</button>
                      </div>
                    </div>
                    {selectedPhoto.storagePath && (
                      <div>
                        <label style={{ fontSize: 11, color: "var(--dash-muted)", fontWeight: 600 }}>Chemin Storage</label>
                        <p style={{ fontSize: 11, color: "var(--dash-muted)", wordBreak: "break-all", marginTop: 4 }}>{selectedPhoto.storagePath}</p>
                      </div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <a href={selectedPhoto.url} target="_blank" rel="noreferrer" className="dash-btn"
                        style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}>
                        Ouvrir dans un onglet
                      </a>
                      <button type="button" className="dash-btn dash-btn-danger"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={() => deletePhoto(selectedPhoto)} disabled={deleting}>
                        {deleting ? "Suppression…" : "Supprimer"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Upload ── */}
      {tab === "upload" && (
        <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
          <section className="dash-section">
            <div className="dash-section-head"><h2>Importer des photos</h2></div>
            <div className="dash-field-col">
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Album de destination</label>
                <AlbumPicker value={uploadAlbum} onChange={setUploadAlbum} albums={albums} albumTree={albumTree} />
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--dash-muted)" }}>
                  Sous-albums : choisissez un album parent puis utilisez le bouton <strong>+</strong> dans la sidebar.
                </p>
              </div>
              <div className={`dash-dropzone ${dragOver ? "is-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addToQueue(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="var(--dash-muted)" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <p>Glisser-déposer des images ici ou cliquer</p>
                <small>.jpg · .png · .webp · .gif · Compression auto si &gt; 3 Mo</small>
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*" className="dash-hidden-input"
                onChange={(e) => addToQueue(e.target.files)} />
            </div>
          </section>

          {queue.length > 0 && (
            <section className="dash-section">
              <div className="dash-section-head">
                <h2>{queue.length} fichier{queue.length > 1 ? "s" : ""}</h2>
                <button type="button" className="dash-btn" style={{ height: 28, fontSize: 12 }} onClick={clearDone}>Effacer terminés</button>
              </div>
              <div className="dash-upload-list" style={{ display: "grid", gap: 10 }}>
                {queue.map((item) => (
                  <article key={item.id} className="dash-upload-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>{item.file.name}</strong>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--dash-muted)" }}>
                          {item.compressedFile
                            ? <>{sizeLabel(item.originalSize)} → <strong style={{ color: "#059669" }}>{sizeLabel(item.compressedFile.size)}</strong></>
                            : sizeLabel(item.file.size)}
                        </p>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                        background: item.status === "done" ? "#ecfdf5" : item.status === "error" ? "#fef2f2" : item.status === "compressing" ? "#fef9ec" : "#f0ebf8",
                        color: item.status === "done" ? "#059669" : item.status === "error" ? "#dc2626" : item.status === "compressing" ? "#b45309" : "var(--dash-muted)",
                      }}>
                        {item.status === "done" ? "✓ Uploadé" : item.status === "error" ? "Erreur" : item.status === "compressing" ? "⏳ Compression…" : item.status === "uploading" ? "En cours…" : "En attente"}
                      </span>
                    </div>
                    {item.status !== "done" && (
                      <div className="dash-progress-wrap">
                        <div className="dash-progress"><span style={{ width: `${item.progress}%` }} /></div>
                        <small style={{ flexShrink: 0, fontSize: 11, color: "var(--dash-muted)" }}>{Math.round(item.progress)}%</small>
                      </div>
                    )}
                    {item.url && (
                      <div className="dash-copy-field">
                        <input readOnly value={item.url} className="dash-input" style={{ fontSize: 11 }} />
                        <button type="button" className="dash-btn" onClick={() => copyUrl(item.url)}>Copier</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
                <button type="button" className="dash-btn" onClick={() => setQueue([])}>Vider la liste</button>
                <button type="button" className="dash-btn dash-btn-primary" onClick={startUpload}
                  disabled={uploading || queue.every((q) => q.status === "done")}>
                  {uploading ? "Upload en cours…" : `Uploader ${queue.filter((q) => q.status !== "done").length} fichier(s)`}
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Modales albums */}
      <Modal
        isOpen={!!albumModal}
        onClose={closeAlbumModal}
        title={
          albumModal?.type === "create"
            ? "Creer un album"
            : albumModal?.type === "sub"
              ? `Creer un sous-album dans "${albumModal.parent}"`
              : `Renommer l'album "${albumModal?.album || ""}"`
        }
        size="sm"
      >
        <div className="dash-field-col">
          {albumModal?.type === "sub" && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--dash-muted)" }}>
              Parent : <strong>{albumModal.parent}</strong>
            </p>
          )}
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            {albumModal?.type === "rename" ? "Nouveau nom" : "Nom"}
          </label>
          <input
            autoFocus
            className="dash-input"
            value={albumModalValue}
            onChange={(e) => setAlbumModalValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAlbumModal();
              if (e.key === "Escape") closeAlbumModal();
            }}
            placeholder={albumModal?.type === "sub" ? "nom-du-sous-album" : "nom-de-l-album"}
          />
          <div className="dash-modal-actions">
            <button type="button" className="dash-btn" onClick={closeAlbumModal}>Annuler</button>
            <button type="button" className="dash-btn dash-btn-primary" onClick={submitAlbumModal} disabled={albumSubmitting}>
              {albumSubmitting ? "En cours..." : "Valider"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={moveModalOpen}
        onClose={() => !moving && setMoveModalOpen(false)}
        title={`Deplacer ${selectedIds.size} photo(s)`}
        size="sm"
      >
        <div className="dash-field-col">
          <label style={{ fontSize: 13, fontWeight: 600 }}>Album de destination</label>
          <AlbumPicker
            value={moveAlbumTarget}
            onChange={setMoveAlbumTarget}
            albums={albums}
            albumTree={albumTree}
            placeholder="- Choisir un album -"
          />
          <div className="dash-modal-actions">
            <button type="button" className="dash-btn" onClick={() => setMoveModalOpen(false)} disabled={moving}>Annuler</button>
            <button
              type="button"
              className="dash-btn dash-btn-primary"
              onClick={() => moveToAlbum(moveAlbumTarget)}
              disabled={moving || selectedIds.size === 0 || !moveAlbumTarget}
            >
              {moving ? "D?placement..." : "Deplacer"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteAlbumTarget}
        onClose={() => !deletingAlbum && setDeleteAlbumTarget(null)}
        title={`Supprimer l'album "${deleteAlbumTarget || ""}"`}
        size="md"
      >
        <p style={{ marginTop: 0, marginBottom: 20 }}>
          Cet album contient <strong>{deleteAlbumPhotos.length} photo{deleteAlbumPhotos.length > 1 ? "s" : ""}</strong>.
          {deleteAlbumPhotos.length > 0 ? " Choisissez une action." : ""}
        </p>

        {deleteAlbumPhotos.length > 0 && (
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <label className={`dash-modal-option ${deleteAlbumMode === "reassign" ? "is-selected" : ""}`} onClick={() => setDeleteAlbumMode("reassign")}>
              <input
                type="radio"
                name="deleteMode"
                value="reassign"
                checked={deleteAlbumMode === "reassign"}
                onChange={() => setDeleteAlbumMode("reassign")}
                style={{ marginTop: 2 }}
              />
              <div>
                <strong style={{ fontSize: 13 }}>Deplacer les photos vers un autre album</strong>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--dash-muted)" }}>Les photos sont conservees.</p>
                {deleteAlbumMode === "reassign" && (
                  <AlbumPicker
                    value={deleteAlbumDest}
                    onChange={setDeleteAlbumDest}
                    albums={albums.filter((a) => a !== deleteAlbumTarget && !a.startsWith((deleteAlbumTarget || "") + "/"))}
                    albumTree={Object.fromEntries(Object.entries(albumTree).filter(([k]) => k !== deleteAlbumTarget && !(deleteAlbumTarget || "").startsWith(k + "/")))}
                    placeholder="- Choisir un album -"
                    style={{ marginTop: 8, width: "100%" }}
                  />
                )}
              </div>
            </label>

            <label className={`dash-modal-option danger ${deleteAlbumMode === "delete" ? "is-selected" : ""}`} onClick={() => setDeleteAlbumMode("delete")}>
              <input
                type="radio"
                name="deleteMode"
                value="delete"
                checked={deleteAlbumMode === "delete"}
                onChange={() => setDeleteAlbumMode("delete")}
                style={{ marginTop: 2 }}
              />
              <div>
                <strong style={{ fontSize: 13, color: deleteAlbumMode === "delete" ? "#dc2626" : "inherit" }}>Supprimer toutes les photos</strong>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--dash-muted)" }}>Action irreversible.</p>
              </div>
            </label>
          </div>
        )}

        <div className="dash-modal-actions">
          <button type="button" className="dash-btn" onClick={() => setDeleteAlbumTarget(null)} disabled={deletingAlbum}>Annuler</button>
          <button
            type="button"
            className={`dash-btn ${deleteAlbumMode === "delete" ? "dash-btn-danger" : "dash-btn-primary"}`}
            onClick={confirmDeleteAlbum}
            disabled={deletingAlbum || (deleteAlbumPhotos.length > 0 && deleteAlbumMode === "reassign" && !deleteAlbumDest)}
          >
            {deletingAlbum ? "En cours..." : deleteAlbumMode === "delete" ? "Supprimer les photos" : "Deplacer et supprimer l'album"}
          </button>
        </div>
      </Modal>

    </div>
  );
}
