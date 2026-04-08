import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/app/firebase"; // Assurez-vous d'avoir configuré Firebase

export async function POST(request) {
  try {
    // Récupération des données du client
    const { email, numeroDeReservation } = await request.json();

    // On interroge la collection "reservations" en filtrant sur:
    // - numeroDeReservation (champ au niveau racine)
    // - legal.email (champ imbriqué dans l'objet "legal")
    const reservationsRef = collection(db, "reservations");
    const q = query(
      reservationsRef,
      where("numeroDeReservation", "==", numeroDeReservation),
      where("legal.email", "==", email)
    );
    const querySnapshot = await getDocs(q);

    // Si aucune réservation n'est trouvée, on renvoie une erreur 404
    if (querySnapshot.empty) {
      return new Response(
        JSON.stringify({ error: "Aucune réservation trouvée pour cet email et ce numéro." }),
        { status: 404 }
      );
    }

    // Supposons qu'il y ait une seule réservation correspondante
    const reservationDoc = querySnapshot.docs[0];
    const reservationData = reservationDoc.data();

    // Vérifier qu'un token unique existe
    const tokenUnique = reservationData.tokenUnique;
    if (!tokenUnique) {
      return new Response(
        JSON.stringify({ error: "Token unique manquant dans la réservation." }),
        { status: 500 }
      );
    }

    // Renvoie le lien d'accès sous la forme "/reservation/{tokenUnique}"
    return new Response(
      JSON.stringify({ lienAcces: `/reservation/${tokenUnique}` }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de la recherche de la réservation:", error);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la recherche de la réservation." }),
      { status: 500 }
    );
  }
}
