import { adminDb } from "@/src/lib/serverFirebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { adminErrorResponse, requireFirebaseUser } from "@/src/lib/serverAdminAuth";
import { passengersInMyScope, reservationForRollCall } from "@/src/components/espace/convoy";
import { normalizeReservationStatus } from "@/src/lib/reservations";

export async function GET(request, { params }) {
  try {
    const user = await requireFirebaseUser(request);
    const { transportId } = await params;
    const db = adminDb();
    const [admin, account, convoy] = await Promise.all([
      db.collection(COLLECTIONS.ADMINS).doc(user.uid).get(),
      db.collection(COLLECTIONS.STAFF_ACCOUNTS).doc(user.uid).get(),
      db.collection(COLLECTIONS.TRANSPORTS).doc(transportId).get(),
    ]);
    const staff = account.data();
    const trip = convoy.data();
    if (!trip || (!admin.exists && (staff?.status !== "approved" || !staff.memberId || !trip.staffMemberIds?.includes(staff.memberId)))) {
      return Response.json({ error: "Accès au convoyage refusé." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const passengers = admin.exists ? trip.passengers || [] : passengersInMyScope(trip, staff.memberId).passengers;
    const allowed = new Set(passengers.map((passenger) => passenger.reservationId));
    const ids = [...new Set(searchParams.getAll("id"))].filter((id) => allowed.has(id) && id && !id.includes("/")).slice(0, 150);
    const bookings = ids.length ? await db.getAll(...ids.map((id) => db.collection(COLLECTIONS.RESERVATIONS).doc(id))) : [];
    const rows = bookings.filter((booking) => booking.exists).map((booking) => {
      const data = booking.data();
      const status = normalizeReservationStatus(data.status);
      if (status !== "validated") return { id: booking.id, status };
      const row = reservationForRollCall(booking.id, { ...data, status });
      return {
        ...row,
        children: row.children.map(({ firstName, lastName, birthDate }) => ({ firstName, lastName, birthDate })),
      };
    });
    return Response.json(rows, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
