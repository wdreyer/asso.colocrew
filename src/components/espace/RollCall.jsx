"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { childAge, isChecked, reservationForRollCall } from "./convoy";
import { telHref } from "./format";
import { Badge, EmptyState, Loader } from "./ui";

/**
 * Children of the member's part of a convoy. Reservations are read one by one by id (the only
 * reservation access the team space has); only validated bookings are listed, as before.
 */
function useReservations(ids) {
  const key = ids.join("|");
  const [state, setState] = useState({ loading: true, byId: {} });
  useEffect(() => {
    let active = true;
    const list = key ? key.split("|") : [];
    setState({ loading: true, byId: {} });
    Promise.all(list.map((id) => getDoc(doc(db, COLLECTIONS.RESERVATIONS, id))
      .then((snapshot) => (snapshot.exists() ? reservationForRollCall(id, snapshot.data()) : null))
      .catch(() => null)))
      .then((rows) => active && setState({ loading: false, byId: Object.fromEntries(rows.filter(Boolean).map((row) => [row.id, row])) }));
    return () => { active = false; };
  }, [key]);
  return state;
}

/** Marks a child present on the convoy document (same `attendance` shape as the dashboard). */
async function togglePresence(transportId, reservationId, checked, member) {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, COLLECTIONS.TRANSPORTS, transportId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const passengers = (snapshot.data().passengers || []).map((passenger) => (
      passenger.reservationId !== reservationId ? passenger : {
        ...passenger,
        attendance: {
          checkedIn: checked,
          checkedInAt: checked ? new Date().toISOString() : "",
          checkedInBy: checked ? member.id : "",
          checkedInByName: checked ? member.name : "",
        },
      }
    ));
    transaction.update(ref, { passengers, updatedAt: serverTimestamp() });
  });
}

export default function RollCall({ transport, passengers, canCheck, member }) {
  const ids = [...new Set(passengers.map((passenger) => passenger.reservationId).filter(Boolean))];
  const { loading, byId } = useReservations(ids);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  if (loading) return <Loader label="Chargement des enfants…" />;

  const rows = passengers
    .map((passenger) => ({ passenger, reservation: byId[passenger.reservationId] }))
    .filter(({ reservation }) => !reservation || reservation.status === "validated")
    .sort((left, right) => String(left.passenger.pickupCity || "").localeCompare(String(right.passenger.pickupCity || ""), "fr"));

  if (!rows.length) return <EmptyState title="Aucun enfant inscrit sur ta partie du trajet pour l’instant" />;

  const checkedCount = rows.filter(({ passenger }) => isChecked(passenger)).length;

  const toggle = async (passenger) => {
    setBusy(passenger.reservationId);
    setError("");
    try {
      await togglePresence(transport.id, passenger.reservationId, !isChecked(passenger), member);
    } catch {
      setError("Pointage impossible (connexion ?). Réessaie.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      {canCheck && <p className="mb-2 text-sm font-bold text-[#24173D]">{checkedCount} / {rows.length} famille{rows.length > 1 ? "s" : ""} pointée{checkedCount > 1 ? "s" : ""}</p>}
      {error && <p className="mb-2 text-sm font-bold text-[#b42318]">{error}</p>}
      <ul className="space-y-2">
        {rows.map(({ passenger, reservation }) => {
          const checked = isChecked(passenger);
          const children = reservation?.children?.length ? reservation.children : [{ firstName: "Enfant", lastName: "" }];
          const phone = reservation?.phones?.[0];
          const destination = transport.direction === "retour" ? reservation?.returnCity : "";
          return (
            <li key={passenger.reservationId} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 ${checked ? "border-[#86efac] bg-[#f0fdf4]" : "border-[#ece3f3] bg-white"}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {reservation?.stayCode && <Badge tone="info">{reservation.stayCode}</Badge>}
                  <span className="font-bold text-[#24173D]">
                    {children.map((child) => {
                      const age = childAge(child.birthDate, transport.date);
                      return `${child.firstName || ""} ${child.lastName || ""}`.trim() + (age ? ` (${age} ans)` : "");
                    }).join(", ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#6b5c7b]">
                  {passenger.pickupCity && <strong className="text-[#24173D]">{passenger.pickupCity}</strong>}
                  {destination && destination !== passenger.pickupCity && <> → {destination}</>}
                  {reservation?.parentName && <> · {reservation.parentName}</>}
                  {reservation?.numeroDeReservation && <> · {reservation.numeroDeReservation}</>}
                </p>
                {phone ? (
                  <a href={telHref(phone)} className="mt-1 inline-block text-sm font-bold text-[#6d28d9]">Appeler {reservation.phones.join(" / ")}</a>
                ) : !reservation && <p className="mt-1 text-xs text-[#9a8cab]">Coordonnées indisponibles</p>}
              </div>
              {canCheck && (
                <button
                  type="button"
                  disabled={busy === passenger.reservationId}
                  onClick={() => toggle(passenger)}
                  className={`min-h-11 min-w-[88px] rounded-xl border text-sm font-bold ${checked ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-[#d6cce0] bg-[#faf8fc] text-[#24173D]"}`}
                >
                  {checked ? "Présent" : "Pointer"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
