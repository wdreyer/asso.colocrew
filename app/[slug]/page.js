"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import StaticPageShell from "@/app/components/layout/StaticPageShell";

function toMillis(value) {
  if (value?.toMillis) return value.toMillis();
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function humanizeSlug(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RootDynamicPage() {
  const params = useParams();
  const slug = String(params?.slug || "").trim().toLowerCase();
  const targetPath = `/${slug}`;
  const legacyPath = `/blog/${slug}`;

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return undefined;
    }

    const q = query(
      collection(db, COLLECTIONS.PAGES),
      where("path", "in", [targetPath, legacyPath]),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

        const published =
          docs.find(
            (item) =>
              String(item.status || "published").toLowerCase() === "published" &&
              String(item.path || "").toLowerCase() === targetPath,
          ) || docs.find((item) => String(item.status || "published").toLowerCase() === "published");

        setPage(published || null);
        setLoading(false);
      },
      () => {
        setPage(null);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [slug, targetPath, legacyPath]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-[#5b4b6f]">
        Chargement...
      </main>
    );
  }

  if (!page) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-[#24173D]">
        <Link href="/" className="text-sm font-semibold text-[#A45A86] hover:underline">
          ? Retour ? l'accueil
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold" style={{ fontFamily: '"Baloo 2", cursive' }}>
          Page introuvable
        </h1>
      </main>
    );
  }

  return (
    <StaticPageShell
      title={String(page.nom || humanizeSlug(slug)).trim() || humanizeSlug(slug)}
      subtitle={String(page.subtitle || "").trim()}
      heroImage={String(page.heroImage || "").trim()}
      eyebrow={String(page.eyebrow || page?.data?.category || "").trim()}
      contentMaxClass="max-w-5xl"
      articleMaxWidth="860px"
    >
      <div className="article-body">
        {String(page.body || "").trim() ? (
          <div dangerouslySetInnerHTML={{ __html: String(page.body || "") }} />
        ) : (
          <p>Aucun contenu pour cette page.</p>
        )}
      </div>
    </StaticPageShell>
  );
}
