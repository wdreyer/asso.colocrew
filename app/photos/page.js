"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import styles from "./photos.module.css";

const SORTS = [
  { value: "date_desc", label: "Date (récentes)" },
  { value: "date_asc", label: "Date (anciennes)" },
  { value: "name_asc", label: "Nom A → Z" },
  { value: "name_desc", label: "Nom Z → A" },
  { value: "size_desc", label: "Taille décroissante" },
  { value: "order", label: "Ordre manuel" },
];

function seg(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function folder(path) {
  return String(path || "")
    .replace(/\\+/g, "/")
    .split("/")
    .map(seg)
    .filter(Boolean)
    .join("/");
}

function inferFolder(raw) {
  const fromField = folder(raw?.albumPath || raw?.folderPath || raw?.album || "");
  if (fromField) return fromField;
  const sp = String(raw?.storagePath || "");
  const idx = sp.toLowerCase().indexOf("banqueimage/");
  if (idx >= 0) {
    const rel = sp.slice(idx + "banqueimage/".length);
    const slash = rel.lastIndexOf("/");
    if (slash > 0) return folder(rel.slice(0, slash));
  }
  return "";
}

function filename(v) {
  const source = String(v || "photo.jpg");
  const dot = source.lastIndexOf(".");
  const base = seg(dot > 0 ? source.slice(0, dot) : source) || "photo";
  const ext = seg(dot > 0 ? source.slice(dot + 1) : "jpg") || "jpg";
  return `${base}.${ext}`;
}

function dedupe(name, existing) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let out = `${base}${ext}`;
  let i = 1;
  while (existing.has(out.toLowerCase())) {
    out = `${base}_${i}${ext}`;
    i += 1;
  }
  existing.add(out.toLowerCase());
  return out;
}

function parent(path) {
  if (!path) return "";
  const p = path.split("/").filter(Boolean);
  p.pop();
  return p.join("/");
}

function label(path) {
  if (!path) return "Racine";
  const p = path.split("/").filter(Boolean);
  return p[p.length - 1] || "Racine";
}

function inTree(path, root) {
  if (!root) return true;
  return path === root || path.startsWith(`${root}/`);
}

function toMs(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

function sortPhotos(list, mode) {
  const out = [...list];
  if (mode === "date_asc") out.sort((a, b) => a.ms - b.ms);
  else if (mode === "name_asc") out.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
  else if (mode === "name_desc") out.sort((a, b) => b.nom.localeCompare(a.nom, "fr", { sensitivity: "base" }));
  else if (mode === "size_desc") out.sort((a, b) => Number(b.taille || 0) - Number(a.taille || 0));
  else if (mode === "order") out.sort((a, b) => Number(a.ordre || 0) - Number(b.ordre || 0));
  else out.sort((a, b) => b.ms - a.ms);
  return out;
}

function fmtSize(n) {
  const v = Number(n || 0);
  if (!v) return "0 o";
  if (v < 1024) return `${v} o`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} Ko`;
  return `${(v / 1024 / 1024).toFixed(1)} Mo`;
}

export default function PhotosPage() {
  const [photos, setPhotos] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [selected, setSelected] = useState(() => new Set());
  const [newFolder, setNewFolder] = useState("");
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [queue, setQueue] = useState([]);
  const [lightbox, setLightbox] = useState(-1);
  const [moveTarget, setMoveTarget] = useState({ open: false, photo: null, target: "" });
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, COLLECTIONS.PHOTOS), orderBy("dateAjout", "desc")));
      } catch {
        snap = await getDocs(collection(db, COLLECTIONS.PHOTOS));
      }
      const p = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .map((d) => ({
          id: d.id,
          nom: String(d.nom || "photo"),
          folderPath: inferFolder(d),
          url: String(d.url || ""),
          storagePath: String(d.storagePath || ""),
          taille: Number(d.taille || 0),
          ordre: Number(d.ordre || 0),
          ms: toMs(d.dateAjout),
        }))
        .filter((d) => d.url);
      setPhotos(p);
      try {
        const aSnap = await getDocs(collection(db, COLLECTIONS.ALBUMS));
        setAlbums(
          aSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() || {}) }))
            .map((d) => ({ ...d, path: folder(d.path || d.nom || "") }))
            .filter((d) => d.path),
        );
      } catch {
        setAlbums([]);
      }
    } catch (e) {
      toast(e?.message || "Erreur chargement Firebase", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const folders = useMemo(() => {
    const set = new Set();
    photos.forEach((p) => {
      const fp = folder(p.folderPath);
      if (!fp) return;
      const parts = fp.split("/");
      let cur = "";
      parts.forEach((part) => {
        cur = cur ? `${cur}/${part}` : part;
        set.add(cur);
      });
    });
    albums.forEach((a) => set.add(a.path));
    return [...set].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [photos, albums]);

  const visible = useMemo(() => {
    let out = photos;
    if (selectedFolder) out = out.filter((p) => p.folderPath === selectedFolder);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((p) => `${p.nom} ${p.folderPath}`.toLowerCase().includes(q));
    }
    return sortPhotos(out, sort);
  }, [photos, selectedFolder, search, sort]);

  const selectedRows = useMemo(() => photos.filter((p) => selected.has(p.id)), [photos, selected]);

  const createFolder = async () => {
    const path = folder(selectedFolder ? `${selectedFolder}/${newFolder}` : newFolder);
    if (!path) return;
    if (folders.includes(path)) {
      setSelectedFolder(path);
      setNewFolder("");
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, COLLECTIONS.ALBUMS), {
        nom: label(path),
        path,
        parentPath: parent(path),
        createdAt: serverTimestamp(),
      });
      setSelectedFolder(path);
      setNewFolder("");
      await load();
      toast("Dossier créé", "success");
    } catch (e) {
      toast(e?.message || "Création dossier impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const target = selectedFolder || "divers";
    const existing = new Set(photos.filter((p) => p.folderPath === target).map((p) => p.nom.toLowerCase()));
    const q = list.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      nom: dedupe(filename(file.name), existing),
      progress: 0,
      status: "pending",
    }));
    setQueue(q);
    setUploaderOpen(true);

    for (const item of q) {
      const path = `banqueimage/${target}/${item.nom}`;
      await new Promise((resolve) => {
        const task = uploadBytesResumable(ref(storage, path), item.file);
        task.on(
          "state_changed",
          (s) => {
            const progress = s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0;
            setQueue((prev) => prev.map((x) => (x.id === item.id ? { ...x, progress, status: "uploading" } : x)));
          },
          () => {
            setQueue((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: "error" } : x)));
            resolve();
          },
          async () => {
            const url = await getDownloadURL(ref(storage, path));
            await addDoc(collection(db, COLLECTIONS.PHOTOS), {
              nom: item.nom,
              albumPath: target,
              album: label(target),
              url,
              storagePath: path,
              dateAjout: serverTimestamp(),
              taille: Number(item.file.size || 0),
              ordre: photos.filter((p) => p.folderPath === target).length + 1,
            });
            setQueue((prev) => prev.map((x) => (x.id === item.id ? { ...x, progress: 100, status: "done" } : x)));
            resolve();
          },
        );
      });
    }
    await load();
    toast("Upload terminé", "success");
  };

  const removePhotos = async (rows) => {
    if (!rows.length) return;
    if (!window.confirm(`Supprimer ${rows.length} photo(s) ?`)) return;
    setBusy(true);
    try {
      for (const row of rows) {
        try {
          await deleteObject(ref(storage, row.storagePath));
        } catch {}
        await deleteDoc(doc(db, COLLECTIONS.PHOTOS, row.id));
      }
      setSelected(new Set());
      await load();
      toast("Suppression ok", "success");
    } catch (e) {
      toast(e?.message || "Suppression impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  const renamePhoto = async (photo) => {
    const raw = window.prompt("Nouveau nom du fichier", photo.nom);
    if (!raw) return;
    const newName = filename(raw);
    const newPath = `banqueimage/${photo.folderPath || "divers"}/${newName}`;
    setBusy(true);
    try {
      const blob = await (await fetch(photo.url)).blob();
      await uploadBytes(ref(storage, newPath), blob);
      const url = await getDownloadURL(ref(storage, newPath));
      try {
        await deleteObject(ref(storage, photo.storagePath));
      } catch {}
      await updateDoc(doc(db, COLLECTIONS.PHOTOS, photo.id), {
        nom: newName,
        storagePath: newPath,
        url,
        updatedAt: serverTimestamp(),
      });
      await load();
      toast("Photo renommée", "success");
    } catch (e) {
      toast(e?.message || "Renommage impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  const movePhoto = async () => {
    const photo = moveTarget.photo;
    const target = folder(moveTarget.target || "");
    if (!photo || !target) return;
    setBusy(true);
    try {
      const newPath = `banqueimage/${target}/${photo.nom}`;
      const blob = await (await fetch(photo.url)).blob();
      await uploadBytes(ref(storage, newPath), blob);
      const url = await getDownloadURL(ref(storage, newPath));
      try {
        await deleteObject(ref(storage, photo.storagePath));
      } catch {}
      await updateDoc(doc(db, COLLECTIONS.PHOTOS, photo.id), {
        albumPath: target,
        album: label(target),
        storagePath: newPath,
        url,
        updatedAt: serverTimestamp(),
      });
      setMoveTarget({ open: false, photo: null, target: "" });
      await load();
      toast("Photo déplacée", "success");
    } catch (e) {
      toast(e?.message || "Déplacement impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async () => {
    if (!selectedFolder) return;
    const rows = photos.filter((p) => inTree(p.folderPath, selectedFolder));
    if (!window.confirm(`Supprimer ${selectedFolder} et ${rows.length} photo(s) ?`)) return;
    setBusy(true);
    try {
      for (const row of rows) {
        try {
          await deleteObject(ref(storage, row.storagePath));
        } catch {}
        await deleteDoc(doc(db, COLLECTIONS.PHOTOS, row.id));
      }
      const toDelete = albums.filter((a) => inTree(a.path, selectedFolder));
      if (toDelete.length) {
        const batch = writeBatch(db);
        toDelete.forEach((a) => batch.delete(doc(db, COLLECTIONS.ALBUMS, a.id)));
        await batch.commit();
      }
      setSelectedFolder(parent(selectedFolder));
      await load();
      toast("Dossier supprimé", "success");
    } catch (e) {
      toast(e?.message || "Suppression dossier impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <div>
          <p className={styles.kicker}>Back-office médias</p>
          <h1>Photothèque Firebase</h1>
          <p>Design light intégré ColoCrew, dossiers imbriqués, gestion complète des fichiers.</p>
        </div>
        <div className={styles.stats}>
          <span>{photos.length} photos</span>
          <span>{folders.length} dossiers</span>
          <span>{selected.size} sélection</span>
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.row}>
            <input className={styles.input} value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Nouveau dossier" />
            <button className={styles.btnPrimary} onClick={createFolder} disabled={busy || !newFolder.trim()}>Créer</button>
          </div>
          <button className={`${styles.folder} ${selectedFolder === "" ? styles.active : ""}`} onClick={() => setSelectedFolder("")}>
            Racine
          </button>
          {folders.map((f) => (
            <button key={f} className={`${styles.folder} ${selectedFolder === f ? styles.active : ""}`} onClick={() => setSelectedFolder(f)} style={{ paddingLeft: `${12 + f.split("/").length * 10}px` }}>
              {f}
            </button>
          ))}
          {selectedFolder ? <button className={styles.btnDanger} onClick={deleteFolder}>Supprimer le dossier</button> : null}
        </aside>

        <section className={styles.content}>
          <div className={styles.row}>
            <input className={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une photo..." />
            <select className={styles.input} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button className={styles.btnPrimary} onClick={() => setUploaderOpen((v) => !v)}>Ajouter des photos</button>
          </div>

          {uploaderOpen ? (
            <div className={styles.upload}>
              <label className={styles.btnSecondary}>
                Sélectionner des images
                <input type="file" hidden multiple accept="image/*" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
              </label>
              <p>Dossier cible: <strong>{selectedFolder || "divers"}</strong></p>
              {queue.map((q) => (
                <div key={q.id} className={styles.progressLine}>
                  <span>{q.nom}</span>
                  <div><i style={{ width: `${q.progress}%` }} /></div>
                </div>
              ))}
            </div>
          ) : null}

          {selected.size > 0 ? (
            <div className={styles.bulk}>
              <span>{selected.size} sélectionnée(s)</span>
              <button className={styles.btnSecondary} onClick={() => setSelected(new Set())}>Vider</button>
              <button className={styles.btnDanger} onClick={() => removePhotos(selectedRows)}>Supprimer</button>
            </div>
          ) : null}

          {loading ? <p>Chargement...</p> : null}
          {!loading && visible.length === 0 ? <p className={styles.empty}>Aucune photo dans ce dossier.</p> : null}

          <div className={styles.grid}>
            {visible.map((p, idx) => (
              <article key={p.id} className={styles.card}>
                <button className={styles.thumb} onClick={() => setLightbox(idx)}>
                  <img src={p.url} alt={p.nom} loading="lazy" />
                </button>
                <div className={styles.meta}>
                  <label><input type="checkbox" checked={selected.has(p.id)} onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} /> {p.nom}</label>
                  <small>{fmtSize(p.taille)}</small>
                  <div className={styles.actions}>
                    <button onClick={() => navigator.clipboard.writeText(p.url)}>URL</button>
                    <button onClick={() => renamePhoto(p)}>Renommer</button>
                    <button onClick={() => setMoveTarget({ open: true, photo: p, target: p.folderPath || "divers" })}>Déplacer</button>
                    <button onClick={() => removePhotos([p])}>Supprimer</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {moveTarget.open ? (
        <div className={styles.modal} onClick={() => setMoveTarget({ open: false, photo: null, target: "" })}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3>Déplacer: {moveTarget.photo?.nom}</h3>
            <select className={styles.input} value={moveTarget.target} onChange={(e) => setMoveTarget((prev) => ({ ...prev, target: e.target.value }))}>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className={styles.row}>
              <button className={styles.btnSecondary} onClick={() => setMoveTarget({ open: false, photo: null, target: "" })}>Annuler</button>
              <button className={styles.btnPrimary} onClick={movePhoto}>Confirmer</button>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox >= 0 && lightbox < visible.length ? (
        <div className={styles.lightbox} onClick={() => setLightbox(-1)}>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((prev) => (prev - 1 + visible.length) % visible.length); }}>‹</button>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={visible[lightbox].url} alt={visible[lightbox].nom} />
            <figcaption>{visible[lightbox].nom}</figcaption>
          </figure>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((prev) => (prev + 1) % visible.length); }}>›</button>
        </div>
      ) : null}

      <div className={styles.toasts}>
        {toasts.map((t) => <div key={t.id} className={`${styles.toast} ${styles[`toast_${t.type}`] || ""}`}>{t.message}</div>)}
      </div>
    </main>
  );
}

