"use client";

import { useState } from "react";
import Link from "next/link";
import { FaEnvelope, FaTicketAlt } from "react-icons/fa";

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
        // Rediriger directement vers l'URL retournée
        window.location.href = data.lienAcces;
      }
    } catch (error) {
      setResult(`Erreur: ${error.message}`);
    }
  };

  return (
    <div className="flex items-center justify-center p-12">
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Retrouver ma réservation
        </h2>
        <form onSubmit={handleFind} className="space-y-4">
          <div className="flex flex-col">
            <label className="mb-1 text-gray-700 font-medium flex items-center gap-2">
              <FaEnvelope className="text-[#B8336A]" />
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
            />
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-gray-700 font-medium flex items-center gap-2">
              <FaTicketAlt className="text-[#A2225A]" />
              Numéro de réservation
            </label>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              required
              className="border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#A2225A]"
            />
          </div>
          <button
            type="submit"
            className="w-full cursor-pointer bg-[#B8336A] hover:bg-[#A2225A] text-white font-semibold py-2 rounded transition"
          >
            Envoyer
          </button>
        </form>
        {result && (
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded text-center">
            <p className="text-gray-700">{result}</p>
          </div>
        )}
        <div className="mt-6 text-center">
          <Link href="/sejours"                 className=" text-m  font-bold font-poppins cursor-pointer md:w-auto  text-[#B8336A]  hover:text-[#A2225A] transition duration-300  "
>
            Vous n'avez pas encore réservé de séjours ? Vous pouvez en réserver un dès maintenant.
          </Link>
        </div>
      </div>
    </div>
  );
}
