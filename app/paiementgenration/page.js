"use client";
import { useState } from "react";

export default function Paiement3xCheckout() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      return setError("Montant invalide");
    }
    setLoading(true);

    try {
      const res = await fetch("/api/create-stripe-3x-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: value,
          customer_email: "client@exemple.com",
          description,      // 🆕 on passe la description du panier
        }),
      });

      const data = res.headers.get("content-type")?.includes("json")
        ? await res.json()
        : {};

      if (!res.ok) {
        throw new Error(data.error || "Erreur serveur");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Abonnement 3× (hosted)</h1>

      <label className="block">
        Description du panier
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full border rounded p-2"
          placeholder="Ex. : Packs de cours + support"
          required
        />
      </label>

      <label className="block">
        Montant total (€)
        <input
          type="number"
          step="0.01"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full border rounded p-2"
          required
        />
      </label>

      {error && <p className="text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white rounded p-2"
      >
        {loading ? "Chargement…" : "Payer (3×) via Stripe"}
      </button>
    </form>
  );
}
