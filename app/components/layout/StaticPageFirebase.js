"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import StaticPageShell from "./StaticPageShell";
import { db } from "@/app/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

function pickPageDoc(docs = []) {
  if (!docs.length) return null;
  const sorted = [...docs].sort((a, b) => {
    const aUpdated = a?.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
    const bUpdated = b?.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
    return bUpdated - aUpdated;
  });
  return sorted[0] || null;
}

export default function StaticPageFirebase({
  path,
  fallbackTitle,
  fallbackSubtitle = "",
  fallbackHeroImage = "",
  eyebrow = "",
  contentMaxClass = "max-w-6xl",
  articleMaxWidth = "",
  children,
}) {
  const [pageDoc, setPageDoc] = useState(null);

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.PAGES), where("path", "==", path));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        setPageDoc(pickPageDoc(docs));
      },
      () => {
        setPageDoc(null);
      },
    );
    return () => unsubscribe();
  }, [path]);

  const resolved = useMemo(() => {
    const title = String(pageDoc?.nom || "").trim() || fallbackTitle;
    const subtitle = String(pageDoc?.subtitle || "").trim() || fallbackSubtitle;
    const heroImage = String(pageDoc?.heroImage || "").trim() || fallbackHeroImage;
    const resolvedEyebrow = String(pageDoc?.eyebrow || "").trim() || eyebrow;
    const useFirebaseBody = pageDoc?.useFirebaseBody === true;
    const body = useFirebaseBody ? String(pageDoc?.body || "").trim() : "";
    return { title, subtitle, heroImage, eyebrow: resolvedEyebrow, body };
  }, [fallbackHeroImage, fallbackSubtitle, fallbackTitle, eyebrow, pageDoc]);

  return (
    <StaticPageShell
      title={resolved.title}
      subtitle={resolved.subtitle}
      heroImage={resolved.heroImage}
      eyebrow={resolved.eyebrow}
      contentMaxClass={contentMaxClass}
      articleMaxWidth={articleMaxWidth}
    >
      {resolved.body ? (
        <div className="article-body" dangerouslySetInnerHTML={{ __html: resolved.body }} />
      ) : (
        children
      )}
    </StaticPageShell>
  );
}
