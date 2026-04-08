// app/quizz/page.js
"use client";

import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, runTransaction, increment, serverTimestamp, onSnapshot } from "firebase/firestore";

const POLL_ID = "quiz1"; // identique à app/resultats/page.js
const choiceKey = (version) => `quiz:${POLL_ID}:choice:v${version}`;

export default function QuizzPage() {
  const [loading, setLoading] = useState(false);
  const [lastChoice, setLastChoice] = useState(null);
  const [version, setVersion] = useState(0);

  // On écoute la version du reset pour savoir quand réinitialiser le choix local
  useEffect(() => {
    const ref = doc(db, "polls", POLL_ID);
    const unsub = onSnapshot(ref, (snap) => {
      const v = snap.exists() ? (snap.data().resetVersion ?? 0) : 0;
      setVersion(v);
      const stored = typeof window !== "undefined" ? sessionStorage.getItem(choiceKey(v)) : null;
      setLastChoice(stored);
    });
    return () => unsub();
  }, []);

  async function vote(nextChoice) {
    if (loading) return;
    setLoading(true);
    try {
      const ref = doc(db, "polls", POLL_ID);
      const prevChoice = typeof window !== "undefined" ? sessionStorage.getItem(choiceKey(version)) : null;

      // Si on clique sur le même choix, on ne fait rien
      if (prevChoice === nextChoice) {
        setLoading(false);
        return;
      }

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          tx.set(ref, { A: 0, B: 0, C: 0, D: 0, total: 0, resetVersion: 0, createdAt: serverTimestamp() });
        }

        if (!prevChoice) {
          // Premier vote => on ajoute +1 à l’option et au total
          tx.update(ref, { [nextChoice]: increment(1), total: increment(1), lastVoteAt: serverTimestamp() });
        } else {
          // Changement de vote => -1 sur l’ancien, +1 sur le nouveau (total inchangé)
          const update = { lastVoteAt: serverTimestamp() };
          update[prevChoice] = increment(-1);
          update[nextChoice] = increment(1);
          tx.update(ref, update);
        }
      });

      if (typeof window !== "undefined") sessionStorage.setItem(choiceKey(version), nextChoice);
      setLastChoice(nextChoice);
    } catch (e) {
      console.error(e);
      alert("Erreur lors du vote");
    } finally {
      setLoading(false);
    }
  }

  const Btn = ({ label }) => (
    <button
      onClick={() => vote(label)}
      disabled={loading}
      className={`rounded-2xl border px-6 py-4 text-lg font-semibold shadow-sm hover:shadow transition ${
        lastChoice === label ? "bg-gray-900 text-white" : ""
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-md p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Quizz — Vote</h1>
      <p>Choisis une proposition (tu peux changer ton vote) :</p>

      <div className="grid grid-cols-2 gap-4">
        {["A", "B", "C", "D"].map((opt) => (
          <Btn key={opt} label={opt} />
        ))}
      </div>

      {lastChoice && (
        <p className="text-sm opacity-70">
          Ton vote actuel : <strong>{lastChoice}</strong> 
        </p>
      )}
    </main>
  );
}
