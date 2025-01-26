"use client";
import { useState } from "react";

export default function FindReservationPage() {
  const [email, setEmail] = useState("");
  const [numero, setNumero] = useState("");
  const [result, setResult] = useState("");

  const handleFind = async (e) => {
    e.preventDefault();
    setResult("Recherche en cours...");
    try {
      const res = await fetch("/api/find-reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          numeroDeReservation: numero,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setResult(`Erreur: ${data.error}`);
      } else if (data.lienAcces) {
        // Soit on affiche le lien, soit on appelle /api/send-email pour le lui envoyer
        setResult(`Lien d'accès : ${data.lienAcces}`);

        // OU => envoyer un mail de confirmation
        /*
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formType: 'reservationLink',
            email,
            lienAcces: data.lienAcces,
          }),
        });
        setResult("Un lien vous a été envoyé par e-mail !");
        */
      }
    } catch (error) {
      setResult(`Erreur: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Retrouver ma réservation</h1>
      <form onSubmit={handleFind} style={{ display: "flex", flexDirection: "column", maxWidth: 300 }}>
        <label>Email :</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label>Numéro de réservation :</label>
        <input
          type="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          required
        />
        <button type="submit" style={{ marginTop: 10 }}>
          Envoyer
        </button>
      </form>

      {result && (
        <p style={{ marginTop: 20 }}>{result}</p>
      )}
    </div>
  );
}
