"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDownloadURL, listAll, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "@/src/lib/firebase";
import EmptyState from "@/src/components/dashboard/ui/EmptyState";
import { useToast } from "@/src/contexts/ToastContext";
import { DASHBOARD_NAMESPACE } from "@/src/lib/dashboardCollections";

function bytesToLabel(size) {
  if (!size && size !== 0) return "-";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function Medias() {
  const [queue, setQueue] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [folder, setFolder] = useState(`banqueimage/${DASHBOARD_NAMESPACE}`);
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  const configMissing = useMemo(() => {
    return !process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  }, []);

  const loadStorageItems = useCallback(async () => {
    if (configMissing) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rootRef = ref(storage, folder);
      const listed = await listAll(rootRef);
      const mapped = await Promise.all(
        listed.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          return {
            name: itemRef.name,
            path: itemRef.fullPath,
            url,
          };
        }),
      );
      setItems(mapped);
    } catch (_err) {
      showToast("Erreur de lecture du bucket", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [configMissing, folder, showToast]);

  useEffect(() => {
    loadStorageItems();
  }, [loadStorageItems]);

  const onDropFiles = (files) => {
    const accepted = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    const mapped = accepted.map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      progress: 0,
      status: "pending",
      downloadUrl: "",
    }));
    setQueue((prev) => [...prev, ...mapped]);
  };

  const startUpload = async () => {
    if (!queue.length || configMissing) return;
    setUploading(true);

    for (const item of queue) {
      if (item.status === "done") continue;

      const storagePath = `${folder}/${item.file.name}`;
      const storageRef = ref(storage, storagePath);

      await new Promise((resolve) => {
        const task = uploadBytesResumable(storageRef, item.file);
        task.on(
          "state_changed",
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, progress, status: "uploading" } : q)));
          },
          () => {
            setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "error" } : q)));
            resolve();
          },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            setQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, progress: 100, status: "done", downloadUrl: url } : q)),
            );
            resolve();
          },
        );
      });
    }

    setUploading(false);
    showToast("Upload terminé", "success");
    loadStorageItems();
  };

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Médias</h1>
          <p>Upload Firebase Storage (v1 connecté).</p>
        </div>
        <button type="button" className="dash-btn" onClick={loadStorageItems}>
          Actualiser
        </button>
      </header>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Upload vers Firebase Storage</h2>
        </div>

        {configMissing ? (
          <EmptyState
            title="Firebase non configuré"
            description="Renseigne NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET et les variables Firebase dans .env.local"
          />
        ) : (
          <>
            <div className="dash-upload-row">
              <label>
                Dossier cible
                <input className="dash-input" value={folder} onChange={(e) => setFolder(e.target.value)} />
              </label>
            </div>
            <div
              className="dash-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDropFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <p>Glisser-déposer des images ou cliquer pour sélectionner</p>
              <small>.jpg .jpeg .png .webp .gif</small>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.gif"
              className="dash-hidden-input"
              onChange={(e) => onDropFiles(e.target.files)}
            />

            {queue.length ? (
              <div className="dash-upload-list">
                {queue.map((item) => (
                  <article key={item.id} className="dash-upload-item">
                    <div>
                      <strong>{item.file.name}</strong>
                      <p>{bytesToLabel(item.file.size)}</p>
                      {item.downloadUrl ? (
                        <div className="dash-copy-field">
                          <input readOnly value={item.downloadUrl} className="dash-input" />
                          <button
                            type="button"
                            className="dash-btn"
                            onClick={async () => {
                              await navigator.clipboard.writeText(item.downloadUrl);
                              showToast("URL copiée", "success");
                            }}
                          >
                            Copier
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="dash-progress-wrap">
                      <div className="dash-progress">
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                      <small>{Math.round(item.progress)}%</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="dash-modal-actions">
              <button type="button" className="dash-btn dash-btn-primary" onClick={startUpload} disabled={uploading || !queue.length}>
                {uploading ? "Upload en cours..." : "Uploader"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Photos du bucket</h2>
        </div>

        {loading ? (
          <p>Chargement...</p>
        ) : !items.length ? (
          <EmptyState title="Aucune image" description="Le dossier est vide pour le moment." />
        ) : (
          <div className="dash-media-grid">
            {items.map((item) => (
              <article key={item.path} className="dash-media-card">
                <img src={item.url} alt={item.name} loading="lazy" />
                <p>{item.name}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
