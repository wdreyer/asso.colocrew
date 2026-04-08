"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/app/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

const DEFAULT_IMAGE = "/banqueimage/groupes/groupes_004.jpeg";

function normalizePath(path) {
  if (!path) return "/";
  let value = String(path).trim();
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value.toLowerCase();
}

function toMillis(value) {
  if (value?.toMillis) return value.toMillis();
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePage(row) {
  if (!row || typeof row !== "object") return null;
  const path = normalizePath(row.path || "");
  if (path === "/" || path === "/blog") return null;
  const title = String(row.nom || row.title || "").trim();
  if (!title) return null;
  const status = String(row.status || "published").toLowerCase();
  if (status !== "published") return null;
  const category = String(row?.eyebrow || row?.data?.category || row.category || "").trim() || "Page";
  const rawExcerpt = row?.data?.excerpt || row?.data?.excerptHtml || row.excerpt || row.body || "";
  const excerpt = stripHtml(rawExcerpt).slice(0, 220);
  const href = path.startsWith("/blog/") ? `/${path.replace(/^\/blog\//, "")}` : path;
  return {
    id: row.id,
    href,
    title,
    category,
    subtitle: String(row.subtitle || "").trim(),
    image: String(row?.data?.coverImage || row.heroImage || "").trim() || DEFAULT_IMAGE,
    excerpt,
    updatedAt: toMillis(row.updatedAt),
    sortOrder: Number(row?.data?.sortOrder ?? row.sortOrder ?? 9999),
  };
}

function normalizeConfig(row) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  const ids = Array.isArray(data.pageIds)
    ? data.pageIds.map((v) => String(v || "").trim()).filter(Boolean)
    : Array.isArray(data.articleIds)
      ? data.articleIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  return {
    title: String(row?.nom || "Pages & blog").trim(),
    subtitle: String(row?.subtitle || "").trim(),
    featuredPageId: String(data.featuredPageId || data.featuredArticleId || "").trim(),
    pageIds: ids,
  };
}

function CategoryPill({ label }) {
  if (!label) return null;
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-[0.6rem] font-black tracking-[0.18em] uppercase text-[#B8336A] bg-[#fce8f0]">
      {label}
    </span>
  );
}

/* ── Carte grande (featured) ───────────────────────── */
function CardFeatured({ page }) {
  return (
    <Link
      href={page.href}
      className="group grid md:grid-cols-[1fr_1fr] overflow-hidden rounded-2xl bg-white border border-[#e8ddf2] shadow-[0_4px_24px_rgba(36,23,61,0.07)] transition hover:shadow-[0_8px_40px_rgba(36,23,61,0.12)]"
    >
      <div className="relative min-h-[220px] md:min-h-[280px] overflow-hidden">
        <Image
          src={page.image}
          alt={page.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>
      <div className="flex flex-col justify-center gap-3 p-6 md:p-8">
        <CategoryPill label={page.category} />
        <h2
          className="text-xl md:text-2xl font-extrabold leading-snug text-[#1e1040] group-hover:text-[#B8336A] transition-colors"
          style={{ fontFamily: '"Baloo 2", cursive' }}
        >
          {page.title}
        </h2>
        {page.subtitle && (
          <p className="text-sm font-semibold text-[#B8336A]">{page.subtitle}</p>
        )}
        {page.excerpt && (
          <p className="text-sm leading-relaxed text-[#5a4e72] line-clamp-3">{page.excerpt}</p>
        )}
        <span className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-[#B8336A]">
          Lire la suite <span className="transition-transform group-hover:translate-x-1">→</span>
        </span>
      </div>
    </Link>
  );
}

/* ── Carte moyenne (2 sur une ligne) ───────────────── */
function CardMedium({ page }) {
  return (
    <Link
      href={page.href}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white border border-[#e8ddf2] shadow-[0_2px_18px_rgba(36,23,61,0.06)] transition hover:shadow-[0_6px_32px_rgba(36,23,61,0.12)] hover:-translate-y-0.5"
    >
      <div className="relative h-[190px] overflow-hidden">
        <Image
          src={page.image}
          alt={page.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          sizes="(max-width: 768px) 100vw, 40vw"
        />
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
        <div className="absolute bottom-3 left-4">
          <CategoryPill label={page.category} />
        </div>
      </div>
      <div className="flex flex-col gap-2 p-5">
        <h3
          className="text-lg font-extrabold leading-snug text-[#1e1040] group-hover:text-[#B8336A] transition-colors"
          style={{ fontFamily: '"Baloo 2", cursive' }}
        >
          {page.title}
        </h3>
        {page.excerpt && (
          <p className="text-sm leading-relaxed text-[#5a4e72] line-clamp-3">{page.excerpt}</p>
        )}
        <span className="mt-1 text-xs font-bold text-[#B8336A] flex items-center gap-1">
          Lire <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}

/* ── Carte petite (3 par ligne) ─────────────────────── */
function CardSmall({ page }) {
  return (
    <Link
      href={page.href}
      className="group flex gap-4 items-start p-4 rounded-xl border border-[#ede5f5] bg-white/80 transition hover:bg-white hover:shadow-[0_4px_20px_rgba(36,23,61,0.08)] hover:-translate-y-0.5"
    >
      <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-[#f2e8fa]">
        <Image
          src={page.image}
          alt={page.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="80px"
        />
      </div>
      <div className="min-w-0 flex flex-col gap-1">
        <CategoryPill label={page.category} />
        <h4
          className="text-[0.95rem] font-extrabold leading-snug text-[#1e1040] group-hover:text-[#B8336A] transition-colors line-clamp-2"
          style={{ fontFamily: '"Baloo 2", cursive' }}
        >
          {page.title}
        </h4>
        {page.excerpt && (
          <p className="text-xs leading-relaxed text-[#6b5f82] line-clamp-2">{page.excerpt}</p>
        )}
      </div>
    </Link>
  );
}

export default function BlogPage() {
  const [config, setConfig] = useState({
    title: "Pages & blog",
    subtitle: "",
    featuredPageId: "",
    pageIds: [],
  });
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, COLLECTIONS.PAGES),
      (snapshot) => {
        const docs = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        const configDoc = docs.find((row) => normalizePath(row.path || "") === "/blog");
        if (configDoc) setConfig(normalizeConfig(configDoc));
        const next = docs
          .map((row) => normalizePage(row))
          .filter(Boolean)
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return b.updatedAt - a.updatedAt;
          });
        setPages(next);
        setLoading(false);
      },
      () => { setPages([]); setLoading(false); },
    );
    return () => unsubscribe();
  }, []);

  const { featuredPage, secondPair, restPages } = useMemo(() => {
    if (!pages.length) return { featuredPage: null, secondPair: [], restPages: [] };

    const byId = new Map(pages.map((p) => [p.id, p]));
    const orderedFromConfig = config.pageIds.length
      ? config.pageIds.map((id) => byId.get(id)).filter(Boolean)
      : [...pages];
    const ordered = orderedFromConfig.length ? orderedFromConfig : [...pages];

    const featured =
      ordered.find((p) => p.id === config.featuredPageId) || ordered[0] || null;
    const rest = ordered.filter((p) => p.id !== featured?.id);

    return {
      featuredPage: featured,
      secondPair: rest.slice(0, 2),
      restPages: rest.slice(2),
    };
  }, [pages, config.pageIds, config.featuredPageId]);

  return (
    <main className="min-h-screen bg-[#f8f2fb]">

      {/* ── EN-TÊTE ÉDITORIAL ── */}
      <div className="border-b border-[#e0d4ee] bg-white">
        <div className="mx-auto max-w-7xl px-4 md:px-8 pt-16 pb-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-[0.65rem] font-black tracking-[0.28em] uppercase text-[#B8336A] mb-3">
                ColoCrew — Pages
              </p>
              <h1
                className="text-[2.8rem] md:text-[4rem] font-extrabold leading-[0.95] text-[#1e1040]"
                style={{ fontFamily: '"Baloo 2", cursive' }}
              >
                {config.title}
              </h1>
              {config.subtitle && (
                <p className="mt-4 max-w-lg text-base text-[#6b5f82] font-medium">{config.subtitle}</p>
              )}
            </div>
            <div className="hidden md:flex flex-col items-end gap-1 text-right shrink-0">
              <div className="w-12 h-0.5 bg-[#B8336A] mb-2" />
              <p className="text-xs font-semibold text-[#9b8db0]">{pages.length} page{pages.length > 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Ligne décorative journal */}
          <div className="mt-8 flex gap-1">
            <div className="h-[3px] flex-1 bg-[#1e1040]" />
            <div className="h-[3px] w-8 bg-[#B8336A]" />
          </div>
        </div>
      </div>

      {/* ── CONTENU ── */}
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-12">
        {loading ? (
          <p className="text-sm font-medium text-[#6c5d81]">Chargement…</p>
        ) : !featuredPage ? (
          <div className="rounded-2xl border border-[#e3d7ef] bg-white px-6 py-8 text-center text-[#5e5075]">
            Aucune page publiée pour le moment.
          </div>
        ) : (
          <div className="flex flex-col gap-10">

            {/* 1 grande carte */}
            <CardFeatured page={featuredPage} />

            {/* 2 cartes moyennes */}
            {secondPair.length > 0 && (
              <div className="grid md:grid-cols-2 gap-6">
                {secondPair.map((page) => (
                  <CardMedium key={page.id} page={page} />
                ))}
              </div>
            )}

            {/* Séparateur si suite */}
            {restPages.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-[#e0d4ee]" />
                <span className="text-[0.6rem] font-black tracking-[0.2em] uppercase text-[#9b8db0]">Toutes les pages</span>
                <div className="h-px flex-1 bg-[#e0d4ee]" />
              </div>
            )}

            {/* 3 par ligne */}
            {restPages.length > 0 && (
              <div className="grid md:grid-cols-3 gap-4">
                {restPages.map((page) => (
                  <CardSmall key={page.id} page={page} />
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  );
}
