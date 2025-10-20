// app/quizz/page.js
"use client";

import { useState } from "react";
import { db } from "../firebase";
import { doc, setDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";

const POLL_ID = "quiz1"; // identique à app/resultats/page.js

export default function QuizzPage() {
  const [loading, setLoading] = useState(false);
  const [lastChoice, setLastChoice] = useState(null);

  async function vote(option) {
    if (loading) return;
    setLoading(true);
    try {
      const ref = doc(db, "polls", POLL_ID);

      // ✅ Assure l'existence du doc SANS écraser les valeurs actuelles
      await setDoc(
        ref,
        { A: 0, B: 0, C: 0, D: 0, total: 0 },
        { merge: true } // <- important !
      );

      // ✅ Addition atomique côté serveur (pas de "dernier qui gagne")
      await updateDoc(ref, {
        [option]: increment(1),
        total: increment(1),
        lastVoteAt: serverTimestamp(),
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
      {lastChoice && (
        <p className="text-sm opacity-70">Merci ! Vote enregistré : {lastChoice}</p>
      )}
      <p className="text-sm">Va sur <code>/resultats</code> pour les pourcentages en temps réel.</p>
    </main>
  );
}
