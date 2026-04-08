"use client";

/**
 * PhotoPicker v2 — sélecteur de photo rapide et utilisable
 *
 * Stratégie de chargement :
 *   - Au premier open : charge tous les docs photos en une seule requête (limit 600)
 *   - Cache module-level → réouverture instantanée (5 min TTL)
 *   - Filtrage album + recherche 100 % client-side → zéro latence
 *   - Affichage paginé par "slice" (40 par 40) avec IntersectionObserver
 *
 * Props:
 *   isOpen      boolean
 *   onClose     () => void
 *   onSelect    (url: string | string[]) => void
 *   title?      string
 *   multi?      boolean
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import Image from "next/image";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { fetchAllPhotos, invalidatePhotosCache, updatePhotosCache } from "@/src/lib/photosCache";

/* ─── Constants ──────────────────────────────────────────────────────── */
const SLICE_SIZE = 40;
const UPLOAD_CONCURRENCY = 3;

function invalidateCache() { invalidatePhotosCache(); }

/* ─── Helpers ────────────────────────────────────────────────────────── */
function norm(name) {
  return String(name || "photo").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9._-]/g, "") || "photo";
}

function sizeLbl(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

/* ─── Component ──────────────────────────────────────────────────────── */
export default function PhotoPicker({
  isOpen, onClose, onSelect,
  title = "Choisir une photo",
  multi = false,
}) {
  const fileInputRef = useRef(null);
  const sentinelRef  = useRef(null);

  const [tab,           setTab]           = useState("library");
  const [photos,        setPhotos]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [search,        setSearch]        = useState("");
  const [album,         setAlbum]         = useState("all");
  const [sliceEnd,      setSliceEnd]      = useState(SLICE_SIZE);
  const [picked,        setPicked]        = useState([]);

  // Upload
  const [uploadAlbum,  setUploadAlbum]  = useState("banqueimage");
  const [queue,         setQueue]         = useState([]);
  const [uploading,     setUploading]     = useState(false);
  const [dragOver,      setDragOver]      = useState(false);

  /* ── Load all photos once ── */
  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchAllPhotos();
    setPhotos(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Reset UI state
    setPicked([]); setSearch(""); setAlbum("all"); setTab("library"); setSliceEnd(SLICE_SIZE);
    load();
  }, [isOpen, load]);

  // Keyboard close
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);

  /* ── Derived ── */
  const albums = useMemo(() => {
    const counts = {};
    photos.forEach(p => { const a = p.album || "—"; counts[a] = (counts[a] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [photos]);

  const filtered = useMemo(() => {
    let list = album === "all" ? photos : photos.filter(p => (p.album || "—") === album);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(p => `${p.nom || ""} ${p.album || ""}`.toLowerCase().includes(q));
    return list;
  }, [photos, album, search]);

  const displayed = filtered.slice(0, sliceEnd);
  const hasMore   = sliceEnd < filtered.length;

  // Reset slice when filter changes
  useEffect(() => { setSliceEnd(SLICE_SIZE); }, [album, search]);

  /* ── IntersectionObserver for auto-load-more ── */
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setSliceEnd(s => s + SLICE_SIZE);
    }, { rootMargin: "200px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, displayed.length]);

  /* ── Selection ── */
  const pick = (url) => {
    if (!multi) { onSelect(url); onClose?.(); return; }
    setPicked(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
  };

  const confirmMulti = () => { if (picked.length) { onSelect(picked); onClose?.(); } };

  /* ── Upload ── */
  const addToQueue = (files) => {
    const acc = Array.from(files || []).filter(f => f.type.startsWith("image/"));
    setQueue(prev => [...prev, ...acc.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file, progress: 0, status: "pending", url: "",
    }))]);
  };

  const uploadOne = useCallback(async (item) => {
    const filename = norm(item.file.name);
    const path = `${uploadAlbum}/${Date.now()}-${filename}`;
    return new Promise(resolve => {
      const task = uploadBytesResumable(ref(storage, path), item.file);
      task.on("state_changed",
        snap => {
          const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
          setQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: pct, status: "uploading" } : q));
        },
        () => { setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error" } : q)); resolve(null); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          try {
            const docRef = await addDoc(collection(db, COLLECTIONS.PHOTOS), {
              nom: filename, album: uploadAlbum, url, storagePath: path,
              dateAjout: serverTimestamp(), taille: item.file.size || 0, ordre: 0,
            });
            const newPhoto = { id: docRef.id, nom: filename, album: uploadAlbum, url, storagePath: path, taille: item.file.size || 0 };
            setPhotos(prev => [newPhoto, ...prev]);
            updatePhotosCache(c => [newPhoto, ...c]);
          } catch { /* best effort */ }
          setQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: 100, status: "done", url } : q));
          resolve(url);
        },
      );
    });
  }, [uploadAlbum]);

  const startUpload = async () => {
    if (!queue.length || uploading) return;
    setUploading(true);
    const pending = queue.filter(q => q.status !== "done");
    const newUrls = [];
    // run with concurrency
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        const url = await uploadOne(item);
        if (url) newUrls.push(url);
      }
    }));
    setUploading(false);
    invalidateCache();
    if (newUrls.length) {
      setTab("library");
      if (!multi && newUrls.length === 1) { onSelect(newUrls[0]); onClose?.(); }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pp-overlay" onClick={e => e.target === e.currentTarget && onClose?.()} role="presentation">
      <div className="pp-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="pp-header">
          <div className="pp-header-left">
            <span className="pp-title">{title}</span>
            {!loading && <span className="pp-count">{photos.length} photos · {albums.length} albums</span>}
          </div>
          <div className="pp-header-right">
            {tab === "library" && (
              <>
                <button type="button" className="pp-tab-btn" onClick={() => setTab("upload")}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  Uploader
                </button>
                <button type="button" className="pp-tab-btn" onClick={() => { invalidateCache(); load(); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" stroke="currentColor"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15A9 9 0 1 1 21 9"/></svg>
                </button>
              </>
            )}
            {tab === "upload" && (
              <button type="button" className="pp-tab-btn" onClick={() => setTab("library")}>
                ← Bibliothèque
              </button>
            )}
            {multi && picked.length > 0 && (
              <button type="button" className="pp-confirm-btn" onClick={confirmMulti}>
                Ajouter {picked.length} photo{picked.length > 1 ? "s" : ""}
              </button>
            )}
            <button type="button" className="pp-close" onClick={onClose} aria-label="Fermer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* ── Library tab ── */}
        {tab === "library" && (
          <div className="pp-body">
            {/* Sidebar albums */}
            <div className="pp-albums">
              <div className="pp-search-wrap">
                <svg className="pp-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  className="pp-search"
                  placeholder="Rechercher…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
                {search && <button type="button" className="pp-search-clear" onClick={() => setSearch("")}>×</button>}
              </div>

              <div className="pp-album-list">
                <button
                  type="button"
                  className={`pp-album-item ${album === "all" ? "is-active" : ""}`}
                  onClick={() => setAlbum("all")}
                >
                  <span className="pp-album-name">Tous</span>
                  <span className="pp-album-count">{photos.length}</span>
                </button>
                {albums.map(([name, count]) => (
                  <button
                    key={name}
                    type="button"
                    className={`pp-album-item ${album === name ? "is-active" : ""}`}
                    onClick={() => setAlbum(name)}
                  >
                    <span className="pp-album-name">{name}</span>
                    <span className="pp-album-count">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div className="pp-grid-area">
              {loading ? (
                <div className="pp-grid">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="pp-skeleton" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="pp-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" stroke="var(--dash-muted)"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5-4 4-2-2-4 4"/></svg>
                  <p>{search ? `Aucun résultat pour "${search}"` : "Aucune photo dans cet album"}</p>
                </div>
              ) : (
                <>
                  <div className="pp-grid">
                    {displayed.map(photo => {
                      const sel = multi && picked.includes(photo.url);
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          className={`pp-photo ${sel ? "is-selected" : ""}`}
                          onClick={() => pick(photo.url)}
                          title={`${photo.album || ""} / ${photo.nom || ""}`}
                        >
                          <Image
                            src={photo.url}
                            alt={photo.nom || "photo"}
                            fill
                            sizes="(max-width: 640px) 90px, 150px"
                            style={{ objectFit: "cover" }}
                            draggable={false}
                            unoptimized={false}
                          />
                          {sel && (
                            <div className="pp-check">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" stroke="#fff"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Sentinel for IntersectionObserver */}
                  {hasMore && <div ref={sentinelRef} className="pp-sentinel" />}
                  {!hasMore && filtered.length > SLICE_SIZE && (
                    <div className="pp-end">— {filtered.length} photos —</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Upload tab ── */}
        {tab === "upload" && (
          <div className="pp-upload-body">
            <label className="pp-upload-label">
              Album de destination
              <input
                className="dash-input"
                value={uploadAlbum}
                onChange={e => setUploadAlbum(e.target.value)}
                placeholder="ex: surf, ski, banqueimage…"
                list="pp-albums-dl"
              />
              <datalist id="pp-albums-dl">
                {albums.map(([a]) => <option key={a} value={a} />)}
              </datalist>
            </label>

            <div
              className={`dash-dropzone ${dragOver ? "is-over" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addToQueue(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === "Enter" && fileInputRef.current?.click()}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" stroke="var(--dash-muted)">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <p>Glisser-déposer ou cliquer</p>
              <small>.jpg · .png · .webp · .gif</small>
            </div>

            <input ref={fileInputRef} type="file" multiple accept="image/*" className="dash-hidden-input" onChange={e => addToQueue(e.target.files)} />

            {queue.length > 0 && (
              <div className="pp-queue">
                {queue.map(item => (
                  <div key={item.id} className="pp-queue-item">
                    <div className="pp-queue-info">
                      <span className="pp-queue-name">{item.file.name}</span>
                      <span className="pp-queue-size">{sizeLbl(item.file.size)}</span>
                    </div>
                    {item.status !== "done" && item.status !== "pending" && (
                      <div className="dash-progress"><span style={{ width: `${item.progress}%` }} /></div>
                    )}
                    <span className={`pp-queue-status pp-status-${item.status}`}>
                      {item.status === "done" ? "✓" : item.status === "error" ? "Erreur" : item.status === "uploading" ? `${Math.round(item.progress)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="pp-upload-actions">
              {queue.length > 0 && <button type="button" className="dash-btn" onClick={() => setQueue([])}>Vider</button>}
              <button
                type="button"
                className="dash-btn dash-btn-primary"
                onClick={startUpload}
                disabled={uploading || !queue.filter(q => q.status !== "done").length}
              >
                {uploading ? "Upload…" : `Uploader ${queue.filter(q => q.status !== "done").length} fichier(s)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
