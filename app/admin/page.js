"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, getDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/app/firebase";
import Spinner from "@/app/components/layout/Spinner";
import Link from "next/link";

// Icônes utilisées pour les actions
import { FaTrash, FaSave } from "react-icons/fa";

// Fonction utilitaire pour formater les dates au format JJ/MM
const formatDateFR = (isoString) => {
  if (!isoString) return "N/A";
  const date = new Date(isoString);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit"
  });
};

// Fonction utilitaire pour obtenir une valeur de tri selon la clé
const getSortValue = (res, key) => {
  switch (key) {
    case "numeroDeReservation":
      return res.numeroDeReservation || "";
    case "createdAt":
      return res.createdAt ? new Date(res.createdAt) : new Date(0);
    case "urlSejour":
      return res.sejour?.name || res.sejour?.urlSejour || "";
    case "startDate":
      return res.sejour?.startDate ? new Date(res.sejour.startDate) : new Date(0);
    case "numberOfChildren":
      return res.minor?.numberOfChildren || 0;
    case "childNames":
      return Array.isArray(res.minor?.children)
        ? res.minor.children.map((child) => child.firstName).join(", ")
        : "";
    case "legalName":
      return `${res.legal?.firstName || ""} ${res.legal?.lastName || ""}`;
    case "urlCity":
      return res.transport
        ? `${res.transport.departureCity || ""} / ${res.transport.returnCity || ""}`
        : "";
    case "totalPrice":
      return res.payment?.totalPrice || 0;
    case "remaining":
      return res.payment?.totalPrice && res.payment?.paymentStatus !== "paid"
        ? res.payment.totalPrice
        : 0;
    case "paymentMethod":
      return res.options?.paymentMethod || "";
    case "paymentStatus":
      return res.payment?.paymentStatus || "";
    case "tokenUnique":
      return res.tokenUnique || "";
    default:
      return "";
  }
};

export default function AdminReservations() {
  // États d'authentification
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // États de gestion des réservations
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });

  // Vérification de l'authentification via localStorage
  useEffect(() => {
    const authData = localStorage.getItem("colocrew_auth");
    if (authData) {
      try {
        const { expiry } = JSON.parse(authData);
        if (expiry && new Date().getTime() < expiry) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error("Erreur lors de la lecture de l'authentification", err);
      }
    }
  }, []);

  // Fonction de connexion : vérification du mot de passe dans Firestore
  const handleLogin = async () => {
    try {
      const docRef = doc(db, "ColoCrew", "dMSwY57fd61hF8861MyW");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const storedPassword = docSnap.data().password;
        if (inputPassword === storedPassword) {
          const expiry = new Date().getTime() + 7 * 24 * 60 * 60 * 1000;
          localStorage.setItem("colocrew_auth", JSON.stringify({ expiry }));
          setIsAuthenticated(true);
          setAuthError("");
        } else {
          setAuthError("Mot de passe incorrect");
        }
      } else {
        setAuthError("Document d'authentification introuvable");
      }
    } catch (error) {
      console.error("Erreur lors de la vérification du mot de passe", error);
      setAuthError("Erreur lors de la vérification du mot de passe");
    }
  };

  // Chargement des réservations depuis Firestore une fois authentifié
  useEffect(() => {
    if (isAuthenticated) {
      const fetchReservations = async () => {
        try {
          const snap = await getDocs(collection(db, "reservations"));
          setReservations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        } catch (error) {
          console.error("Erreur lors du chargement des réservations", error);
          setLoading(false);
        }
      };
      fetchReservations();
    }
  }, [isAuthenticated]);

  // Gestion de la mise à jour du paiement
  const handleUpdatePayment = async (id, amount) => {
    setUpdatingId(id);
    await updateDoc(doc(db, "reservations", id), {
      "payment.totalPrice": Number(amount)
    });
    setReservations(
      reservations.map((r) =>
        r.id === id
          ? { ...r, payment: { ...r.payment, totalPrice: Number(amount) } }
          : r
      )
    );
    setUpdatingId(null);
  };

  // Validation du paiement (changement de statut)
  const handleValidatePayment = async (id) => {
    setUpdatingId(id);
    await updateDoc(doc(db, "reservations", id), {
      "payment.paymentStatus": "paid"
    });
    setReservations(
      reservations.map((r) =>
        r.id === id
          ? { ...r, payment: { ...r.payment, paymentStatus: "paid" } }
          : r
      )
    );
    setUpdatingId(null);
  };

  // Suppression d'une réservation
  const handleDeleteReservation = async (id) => {
    if (!confirm("Voulez-vous vraiment supprimer cette réservation ?")) return;
    setUpdatingId(id);
    await deleteDoc(doc(db, "reservations", id));
    setReservations(reservations.filter((r) => r.id !== id));
    setUpdatingId(null);
  };

  // Gestion du tri par colonne
  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedReservations = useMemo(() => {
    let sortable = [...reservations];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        const aValue = getSortValue(a, sortConfig.key);
        const bValue = getSortValue(b, sortConfig.key);
        if (aValue instanceof Date && bValue instanceof Date) {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        } else if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        } else {
          const compare = String(aValue).localeCompare(String(bValue));
          return sortConfig.direction === "asc" ? compare : -compare;
        }
      });
    }
    return sortable;
  }, [reservations, sortConfig]);

  // Si l'utilisateur n'est pas authentifié, afficher le formulaire de connexion
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto p-6 bg-gray-50 min-h-screen flex flex-col justify-center">
        <h1 className="text-2xl font-bold mb-4 text-center">Authentification</h1>
        <div className="mb-4">
          <label className="block font-medium mb-2">Mot de passe</label>
          <input
            type="password"
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
            className="w-full p-2 border rounded-md"
          />
        </div>
        {authError && <div className="text-red-500 mb-4">{authError}</div>}
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Se connecter
        </button>
      </div>
    );
  }

  if (loading) return <Spinner />;

  return (
    <div className="max-w-7xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Gestion des Réservations</h1>
      <div className="overflow-x-auto">
        <table className="w-full bg-white shadow-lg rounded">
          <thead className="bg-[#B8336A] text-white">
            <tr>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("numeroDeReservation")}
              >
                N° Réservation
                {sortConfig.key === "numeroDeReservation" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("createdAt")}
              >
                Date résa
                {sortConfig.key === "createdAt" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("urlSejour")}
              >
                Séjour
                {sortConfig.key === "urlSejour" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("startDate")}
              >
                Dates séjour
                {sortConfig.key === "startDate" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("numberOfChildren")}
              >
                Nb Enfants
                {sortConfig.key === "numberOfChildren" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("childNames")}
              >
                Prénoms enfants
                {sortConfig.key === "childNames" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("legalName")}
              >
                Responsable
                {sortConfig.key === "legalName" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("urlCity")}
              >
                Gare Départ/Arrivée
                {sortConfig.key === "urlCity" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("totalPrice")}
              >
                Payé / Total (€)
                {sortConfig.key === "totalPrice" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("remaining")}
              >
                Reste à payer (€)
                {sortConfig.key === "remaining" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("paymentMethod")}
              >
                Paiement
                {sortConfig.key === "paymentMethod" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("paymentStatus")}
              >
                Statut
                {sortConfig.key === "paymentStatus" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th
                className="p-2 text-sm cursor-pointer"
                onClick={() => handleSort("tokenUnique")}
              >
                Lien
                {sortConfig.key === "tokenUnique" &&
                  (sortConfig.direction === "asc" ? " ↑" : " ↓")}
              </th>
              <th className="p-2 text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedReservations.map((res) => {
              const montantPaye =
                res.payment?.paymentStatus === "paid"
                  ? res.payment?.totalPrice
                  : 0;
              return (
                <tr key={res.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 text-xs">
                    {res.numeroDeReservation || "N/A"}
                  </td>
                  <td className="p-2 text-xs">{formatDateFR(res.createdAt)}</td>
                  <td className="p-2 text-xs">
                    {res.sejour?.name || res.sejour?.urlSejour || "N/A"}
                  </td>
                  <td className="p-2 text-xs">
                    {formatDateFR(res.sejour?.startDate)} -{" "}
                    {formatDateFR(res.sejour?.endDate)}
                  </td>
                  <td className="p-2 text-xs">
                    {res.minor?.numberOfChildren || "N/A"}
                  </td>
                  <td className="p-2 text-xs">
                    {Array.isArray(res.minor?.children)
                      ? res.minor.children.map((child) => child.firstName).join(", ")
                      : "N/A"}
                  </td>
                  <td className="p-2 text-xs">
                    {res.legal?.firstName} {res.legal?.lastName}
                  </td>
                  <td className="p-2 text-xs">
                    {res.transport
                      ? `${res.transport.departureCity || "N/A"} / ${res.transport.returnCity || "N/A"}`
                      : "N/A"}
                  </td>
                  <td className="p-2 text-xs">
                    {montantPaye} / {res.payment?.totalPrice}
                  </td>
                  <td className="p-2 text-xs">
                    <input
                      type="number"
                      defaultValue={res.payment?.totalPrice - montantPaye}
                      className="border rounded p-1 w-20 text-xs"
                      disabled={updatingId === res.id}
                      onBlur={(e) =>
                        handleUpdatePayment(res.id, e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2 text-xs">
                    {res.options?.paymentMethod === "CB"
                      ? "Carte bancaire"
                      : "Chèque/Virement"}
                  </td>
                  <td
                    className={`p-2 text-xs ${
                      res.payment?.paymentStatus === "paid"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {res.payment?.paymentStatus === "paid"
                      ? "Payé"
                      : "Non payé"}
                  </td>
                  <td className="p-2 text-xs">
                    <Link
                      href={`/reservation/${res.tokenUnique}`}
                      className="text-blue-500 underline"
                    >
                      Voir
                    </Link>
                  </td>
                  <td className="p-2 text-xs">
                    <div className="flex items-center justify-center gap-2">
                      {res.payment?.paymentStatus !== "paid" && (
                        <button
                          onClick={() => handleValidatePayment(res.id)}
                          className="flex items-center justify-center bg-green-500 hover:bg-green-600 text-white p-2 rounded"
                          disabled={updatingId === res.id}
                          title="Valider paiement"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            className="w-4 h-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteReservation(res.id)}
                        className="flex items-center justify-center bg-red-500 hover:bg-red-600 text-white p-2 rounded"
                        disabled={updatingId === res.id}
                        title="Supprimer la réservation"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4a1 1 0 011 1v0a1 1 0 01-1 1h-4a1 1 0 01-1-1v0a1 1 0 011-1z"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
