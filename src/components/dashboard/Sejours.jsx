"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Badge from "@/src/components/dashboard/ui/Badge";
import { useToast } from "@/src/contexts/ToastContext";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { formatPriceRange, resolveSejourPriceRange } from "@/src/lib/pricing";

function getVisibility(item) {
  const status = String(item?.status || "").toLowerCase();
  if (item?.archived === true || status === "archived") return "archived";
  if (
    item?.isOnline === false ||
    status === "offline" ||
    status === "draft" ||
    status === "hidden"
  ) {
    return "offline";
  }
  return "online";
}

function firstDate(item) {
  const dates = item?.dates || [];
  if (!dates.length) return null;
  const sorted = [...dates].sort((a, b) =>
    String(a.startDate).localeCompare(String(b.startDate)),
  );
  return sorted[0]?.startDate
    ? new Date(sorted[0].startDate).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
}

function visibilityBadge(visibility) {
  if (visibility === "online") return { label: "En ligne", variant: "success" };
  if (visibility === "offline") return { label: "Hors ligne", variant: "warning" };
  return { label: "Archivé", variant: "neutral" };
}


function adminPriceLabel(sejour) {
  const range = resolveSejourPriceRange(sejour);
  if (!(range.min > 0 || range.max > 0)) return "";
  if (range.min === range.max) return `a partir de ${formatPriceRange(range)}`;
  return formatPriceRange(range);
}

export default function Sejours() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.SEJOURS), orderBy("name", "asc")),
      );
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      showToast("Erreur de chargement des séjours", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer "${item.name}" ?`)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.SEJOURS, item.id));
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      showToast("Séjour supprimé", "success");
    } catch {
      showToast("Erreur de suppression", "error");
    }
  };

  const onArchive = async (e, item) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, COLLECTIONS.SEJOURS, item.id), {
        archived: true,
        status: "archived",
        isOnline: false,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, archived: true, status: "archived", isOnline: false }
            : row,
        ),
      );
      showToast("Séjour archivé", "success");
    } catch {
      showToast("Erreur d’archivage", "error");
    }
  };

  const onRestore = async (e, item) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, COLLECTIONS.SEJOURS, item.id), {
        archived: false,
        status: "online",
        isOnline: true,
        archivedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, archived: false, status: "online", isOnline: true }
            : row,
        ),
      );
      showToast("Séjour remis en ligne", "success");
    } catch {
      showToast("Erreur de restauration", "error");
    }
  };

  const onSetOffline = async (e, item) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, COLLECTIONS.SEJOURS, item.id), {
        archived: false,
        status: "offline",
        isOnline: false,
        archivedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, archived: false, status: "offline", isOnline: false }
            : row,
        ),
      );
      showToast("Séjour mis hors ligne", "success");
    } catch {
      showToast("Erreur de mise hors ligne", "error");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) =>
      `${x.name || ""} ${x.environment || ""} ${x.heroSubtitle || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, search]);

  const online = filtered.filter((x) => getVisibility(x) === "online");
  const offline = filtered.filter((x) => getVisibility(x) === "offline");
  const archived = filtered.filter((x) => getVisibility(x) === "archived");

  const SejourGrid = ({ title, list, emptyMsg }) => (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>{title}</h2>
        <span
          style={{
            fontSize: 13,
            color: "var(--dash-muted)",
            background: "#f0ebf8",
            padding: "2px 10px",
            borderRadius: 999,
            fontWeight: 600,
          }}
        >
          {list.length}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="dash-muted" style={{ fontSize: 13 }}>
          {emptyMsg}
        </p>
      ) : (
        <div className="dash-sejour-grid">
          {list.map((sejour) => {
            const visibility = getVisibility(sejour);
            const badge = visibilityBadge(visibility);

            return (
              <article
                key={sejour.id}
                className="dash-sejour-card"
                onClick={() => router.push(`/dashboard/sejours/${sejour.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" && router.push(`/dashboard/sejours/${sejour.id}`)
                }
              >
                <img
                  className="dash-sejour-card-img"
                  src={sejour.heroImage || "/load.png"}
                  alt={sejour.name || "Séjour"}
                  loading="lazy"
                />
                <div className="dash-sejour-card-body">
                  <h3 className="dash-sejour-card-title">{sejour.name || "Sans titre"}</h3>
                  {sejour.heroSubtitle ? (
                    <p className="dash-sejour-card-sub">{sejour.heroSubtitle}</p>
                  ) : null}
                  <div className="dash-sejour-card-meta">
                    <Badge label={badge.label} variant={badge.variant} />
                    {sejour.environment ? (
                      <Badge label={sejour.environment} variant="info" />
                    ) : null}
                    {adminPriceLabel(sejour) ? (
                      <span style={{ fontSize: 12, color: "var(--dash-muted)", fontWeight: 600 }}>
                        {adminPriceLabel(sejour)}
                      </span>
                    ) : null}
                    {firstDate(sejour) ? (
                      <span style={{ fontSize: 12, color: "var(--dash-muted)" }}>
                        {firstDate(sejour)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="dash-sejour-card-footer">
                  <button
                    type="button"
                    className="dash-btn dash-btn-primary"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/sejours/${sejour.id}`);
                    }}
                  >
                    Éditer
                  </button>
                  {visibility !== "archived" ? (
                    <button
                      type="button"
                      className="dash-btn"
                      onClick={(e) => onArchive(e, sejour)}
                    >
                      Archiver
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="dash-btn"
                      onClick={(e) => onRestore(e, sejour)}
                    >
                      Remettre en ligne
                    </button>
                  )}
                  {visibility === "online" ? (
                    <button
                      type="button"
                      className="dash-btn"
                      onClick={(e) => onSetOffline(e, sejour)}
                    >
                      Hors ligne
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="dash-btn dash-btn-danger"
                    onClick={(e) => onDelete(e, sejour)}
                  >
                    Suppr.
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="dash-page">
      <header className="dash-page-header dash-page-header-row">
        <div>
          <h1>Séjours</h1>
          <p>Gère la visibilité, archive et édite chaque séjour.</p>
        </div>
        <div className="dash-row-actions">
          <button type="button" className="dash-btn" onClick={load}>
            Actualiser
          </button>
          <button
            type="button"
            className="dash-btn dash-btn-primary"
            onClick={() => router.push("/dashboard/sejours/new")}
          >
            + Nouveau séjour
          </button>
        </div>
      </header>

      <input
        className="dash-input"
        style={{ maxWidth: 420 }}
        placeholder="Rechercher un séjour…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="dash-sejour-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "var(--dash-shadow)",
              }}
            >
              <div className="dash-skeleton-line" style={{ height: 160, borderRadius: 0 }} />
              <div style={{ padding: 14, display: "grid", gap: 8 }}>
                <div className="dash-skeleton-line" style={{ height: 16 }} />
                <div className="dash-skeleton-line short" style={{ height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <SejourGrid
            title="Séjours en ligne"
            list={online}
            emptyMsg="Aucun séjour en ligne."
          />
          <SejourGrid
            title="Séjours hors ligne"
            list={offline}
            emptyMsg="Aucun séjour hors ligne."
          />
          <SejourGrid
            title="Séjours archivés"
            list={archived}
            emptyMsg="Aucun séjour archivé."
          />
        </>
      )}
    </div>
  );
}
