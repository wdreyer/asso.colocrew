"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase";
import Spinner from "@/app/components/layout/Spinner";

const SOURCE_LABELS = {
  avis_manuels: "Avis manuels",
  questionnaire_parent: "Questionnaire parent",
  questionnaire_jeune: "Questionnaire jeune",
};

function toSearchable(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function avg(numbers) {
  if (!numbers.length) return null;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return Number((total / numbers.length).toFixed(2));
}

function formatDate(iso) {
  if (!iso) return "Date inconnue";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR");
}

export default function RetoursPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [loading, setLoading] = useState(true);
  const [retours, setRetours] = useState([]);

  const [sourceFilter, setSourceFilter] = useState("all");
  const [sejourFilter, setSejourFilter] = useState("all");
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const authData = localStorage.getItem("colocrew_auth");
    if (!authData) return;
    try {
      const { expiry } = JSON.parse(authData);
      if (expiry && Date.now() < expiry) {
        setIsAuthenticated(true);
      }
    } catch (_) {
      // no-op
    }
  }, []);

  const handleLogin = async () => {
    try {
      const docRef = doc(db, "ColoCrew", "dMSwY57fd61hF8861MyW");
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        setAuthError("Document d'authentification introuvable");
        return;
      }

      const storedPassword = docSnap.data().password;
      if (inputPassword !== storedPassword) {
        setAuthError("Mot de passe incorrect");
        return;
      }

      const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem("colocrew_auth", JSON.stringify({ expiry }));
      setIsAuthenticated(true);
      setAuthError("");
    } catch (error) {
      console.error(error);
      setAuthError("Erreur de verification du mot de passe");
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchRetours() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "retours"));
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => {
          const dateA = new Date(a.submittedAt || 0).getTime();
          const dateB = new Date(b.submittedAt || 0).getTime();
          return dateB - dateA;
        });
        setRetours(docs);
      } catch (error) {
        console.error("Erreur chargement retours :", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRetours();
  }, [isAuthenticated]);

  const sejourOptions = useMemo(() => {
    const names = new Set();
    retours.forEach((retour) => {
      if (retour.sejourName) names.add(retour.sejourName);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "fr"));
  }, [retours]);

  const filteredRetours = useMemo(() => {
    const q = toSearchable(search);

    return retours.filter((retour) => {
      if (sourceFilter !== "all" && retour.sourceType !== sourceFilter) return false;
      if (sejourFilter !== "all" && retour.sejourName !== sejourFilter) return false;
      if ((retour.globalScoreNormalized || 0) < minScoreFilter) return false;

      if (!q) return true;
      const haystack = toSearchable(
        [
          retour.sejourName,
          retour.childName,
          retour.respondentName,
          ...(retour.highlights || []),
          ...(retour.comments || []).map((item) => item.text),
        ].join(" ")
      );
      return haystack.includes(q);
    });
  }, [minScoreFilter, retours, search, sejourFilter, sourceFilter]);

  const stats = useMemo(() => {
    const allScores = filteredRetours
      .map((retour) => Number(retour.globalScoreNormalized))
      .filter((value) => !Number.isNaN(value));

    const parentScores = filteredRetours
      .filter((retour) => retour.respondentType === "parent")
      .map((retour) => Number(retour.globalScoreNormalized))
      .filter((value) => !Number.isNaN(value));

    const youngScores = filteredRetours
      .filter((retour) => retour.respondentType === "jeune")
      .map((retour) => Number(retour.globalScoreNormalized))
      .filter((value) => !Number.isNaN(value));

    const categoryMap = new Map();
    filteredRetours.forEach((retour) => {
      (retour.ratings || []).forEach((rating) => {
        if (!rating?.category || Number.isNaN(Number(rating.normalized))) return;
        if (!categoryMap.has(rating.category)) {
          categoryMap.set(rating.category, { total: 0, count: 0 });
        }
        const prev = categoryMap.get(rating.category);
        prev.total += Number(rating.normalized);
        prev.count += 1;
      });
    });

    const categoryStats = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        average: Number((data.total / data.count).toFixed(2)),
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total: filteredRetours.length,
      avgGlobal: avg(allScores),
      avgParents: avg(parentScores),
      avgJeunes: avg(youngScores),
      categoryStats,
    };
  }, [filteredRetours]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <h1 className="mb-4 text-center text-2xl font-bold">Acces prive - Retours</h1>
        <label className="mb-2 block text-sm font-medium">Mot de passe</label>
        <input
          type="password"
          value={inputPassword}
          onChange={(event) => setInputPassword(event.target.value)}
          className="w-full rounded border p-2"
        />
        {authError ? <p className="mt-2 text-sm text-red-600">{authError}</p> : null}
        <button
          type="button"
          onClick={handleLogin}
          className="mt-4 rounded bg-[#C03A72] px-4 py-2 font-semibold text-white hover:bg-[#a72f62]"
        >
          Se connecter
        </button>
      </div>
    );
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-[1300px] p-4 md:p-6">
      <div className="mb-6 rounded-2xl border border-[#eadbcc] bg-white p-5">
        <h1 className="text-3xl font-black text-[#22173D]">Retours Familles & Jeunes</h1>
        <p className="mt-1 text-sm text-[#5a5271]">
          Espace prive pour lire tous les avis, filtrer, et suivre les notes moyennes.
        </p>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-[#eadbcc] bg-white p-4">
          <p className="text-xs font-bold tracking-[0.08em] text-[#5a5271]">TOTAL RETOURS</p>
          <p className="mt-1 text-3xl font-black text-[#22173D]">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-[#eadbcc] bg-white p-4">
          <p className="text-xs font-bold tracking-[0.08em] text-[#5a5271]">NOTE MOYENNE GLOBALE</p>
          <p className="mt-1 text-3xl font-black text-[#22173D]">{stats.avgGlobal ?? "N/A"} / 10</p>
        </div>
        <div className="rounded-2xl border border-[#eadbcc] bg-white p-4">
          <p className="text-xs font-bold tracking-[0.08em] text-[#5a5271]">MOYENNE PARENTS</p>
          <p className="mt-1 text-3xl font-black text-[#22173D]">{stats.avgParents ?? "N/A"} / 10</p>
        </div>
        <div className="rounded-2xl border border-[#eadbcc] bg-white p-4">
          <p className="text-xs font-bold tracking-[0.08em] text-[#5a5271]">MOYENNE JEUNES</p>
          <p className="mt-1 text-3xl font-black text-[#22173D]">{stats.avgJeunes ?? "N/A"} / 10</p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 rounded-2xl border border-[#eadbcc] bg-white p-4 md:grid-cols-4">
        <select
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value)}
          className="rounded border p-2 text-sm"
        >
          <option value="all">Toutes les sources</option>
          <option value="avis_manuels">Avis manuels</option>
          <option value="questionnaire_parent">Questionnaire parent</option>
          <option value="questionnaire_jeune">Questionnaire jeune</option>
        </select>

        <select
          value={sejourFilter}
          onChange={(event) => setSejourFilter(event.target.value)}
          className="rounded border p-2 text-sm"
        >
          <option value="all">Tous les sejours</option>
          {sejourOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div className="rounded border p-2 text-sm">
          <label className="mb-1 block text-xs font-semibold text-[#5a5271]">Note mini (/10)</label>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={minScoreFilter}
            onChange={(event) => setMinScoreFilter(Number(event.target.value))}
            className="w-full"
          />
          <p className="text-xs">{minScoreFilter}</p>
        </div>

        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Recherche (nom, commentaire, sejour...)"
          className="rounded border p-2 text-sm"
        />
      </div>

      <div className="mb-6 rounded-2xl border border-[#eadbcc] bg-white p-4">
        <h2 className="mb-3 text-lg font-bold text-[#22173D]">Bilan par categories de notes</h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {stats.categoryStats.slice(0, 12).map((item) => (
            <div key={item.category} className="rounded-xl border border-[#f0e5d8] p-3">
              <p className="text-sm font-semibold text-[#2f2845]">{item.category}</p>
              <p className="text-xs text-[#5a5271]">
                Moyenne {item.average} / 10 • {item.count} reponses
              </p>
            </div>
          ))}
          {stats.categoryStats.length === 0 ? (
            <p className="text-sm text-[#5a5271]">Pas de notes disponibles avec les filtres actuels.</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        {filteredRetours.map((retour) => (
          <article key={retour.id} className="rounded-2xl border border-[#eadbcc] bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#f3e8ff] px-3 py-1 text-xs font-bold text-[#5a3c99]">
                {SOURCE_LABELS[retour.sourceType] || retour.sourceType}
              </span>
              <span className="rounded-full bg-[#fff1e8] px-3 py-1 text-xs font-bold text-[#C03A72]">
                {retour.respondentType === "jeune" ? "Jeune" : "Parent"}
              </span>
              <span className="text-xs text-[#5a5271]">{formatDate(retour.submittedAt)}</span>
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <p className="text-sm font-semibold text-[#22173D]">
                Sejour : <span className="font-normal">{retour.sejourName || "N/A"}</span>
              </p>
              <p className="text-sm font-semibold text-[#22173D]">
                Note globale :{" "}
                <span className="font-normal">{retour.globalScoreNormalized ? `${retour.globalScoreNormalized}/10` : "N/A"}</span>
              </p>
              <p className="text-sm font-semibold text-[#22173D]">
                {retour.respondentType === "parent" ? "Nom parent" : "Nom jeune"} :{" "}
                <span className="font-normal">
                  {retour.parentName || retour.respondentName || retour.childName || "Anonyme"}
                </span>
              </p>
              <p className="text-sm font-semibold text-[#22173D]">
                Periode : <span className="font-normal">{retour.sejourPeriod || "N/A"}</span>
              </p>
            </div>

            {retour.highlights?.length ? (
              <div className="mt-3 rounded-xl border border-[#d8f0df] bg-[#f4fff7] p-3">
                <p className="mb-1 text-xs font-bold text-[#2f7d4f]">Points positifs detectes</p>
                {retour.highlights.map((item, idx) => (
                  <p key={`${retour.id}-hl-${idx}`} className="text-sm text-[#22573a]">
                    • {item}
                  </p>
                ))}
              </div>
            ) : null}

            {retour.comments?.length ? (
              <div className="mt-3 space-y-2">
                {retour.comments.slice(0, 3).map((comment, idx) => (
                  <div key={`${retour.id}-c-${idx}`} className="rounded-xl border border-[#f0e5d8] bg-[#fffcf8] p-3">
                    <p className="text-xs font-bold text-[#5a5271]">{comment.header}</p>
                    <p className="text-sm text-[#322a48]">{comment.text}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {filteredRetours.length === 0 ? (
          <div className="rounded-2xl border border-[#eadbcc] bg-white p-6 text-center text-sm text-[#5a5271]">
            Aucun retour avec les filtres actuels.
          </div>
        ) : null}
      </div>
    </div>
  );
}
