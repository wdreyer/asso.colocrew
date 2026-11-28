import { adminDb } from "@/src/lib/serverFirebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

export async function GET(_request, { params }) {
  const { token } = await params;
  if (typeof token !== "string" || !/^[a-zA-Z0-9_-]{20,128}$/.test(token)) {
    return Response.json({ error: "Réservation introuvable." }, { status: 404 });
  }
  try {
    const snapshot = await adminDb().collection(COLLECTIONS.RESERVATIONS)
      .where("tokenUnique", "==", token).limit(1).get();
    if (snapshot.empty) return Response.json({ error: "Réservation introuvable." }, { status: 404 });
    const { numeroDeReservation, createdAt, status, payment, options, minor, legal, documents, sejour, transport } = snapshot.docs[0].data();
    return Response.json({
      numeroDeReservation,
      createdAt: createdAt?.toDate?.().toISOString() || createdAt,
      status, payment, options, minor, legal, documents, sejour, transport,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Erreur de lecture d’une réservation", error);
    return Response.json({ error: "La réservation est temporairement indisponible." }, { status: 503 });
  }
}
