// app/quizz/page.js
"use client";

import { useState } from "react";
import { db } from "../firebase";
import { doc, runTransaction, increment, serverTimestamp } from "firebase/firestore";

const POLL_ID = "quiz1"; // même ID que dans app/resultats/page.js

export default function QuizzPage() {
  const [loading, setLoading] = useState(false);
  const [lastChoice, setLastChoice] = useState(null);

  async function vote(option) {
    if (loading) return;
    setLoading(true);
    try {
      const ref = doc(db, "polls", POLL_ID);

      // ✅ Transaction = création si absent + increments atomiques
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          // crée le doc avec tous les compteurs à 0
          tx.set(ref, { A: 0, B: 0, C: 0, D: 0, total: 0, createdAt: serverTimestamp() });
        }
        // ajoute le vote (no “remplacement”, c’est un vrai +1)
        tx.update(ref, { [option]: increment(1), total: increment(1), lastVoteAt: serverTimestamp() });
      });

      setLastChoice(option);
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
      className="rounded-2xl border px-6 py-4 text-lg font-semibold shadow-sm hover:shadow transition disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-md p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Quizz — Vote</h1>
      <p>Choisis une proposition :</p>
      <div className="grid grid-cols-2 gap-4">
        {["A", "B", "C", "D"].map((opt) => (
          <Btn key={opt} label={opt} />
        ))}
      </div>
    </main>
  );
}
