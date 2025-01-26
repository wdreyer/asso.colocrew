// app/api/find-reservation/route.js
import { NextResponse } from 'next/server';
import { db } from '@/app/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export async function POST(request) {
  try {
    const { email, numeroDeReservation } = await request.json();

    if (!email || !numeroDeReservation) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
    }

    // On cherche dans Firestore la doc correspondante
    const q = query(
      collection(db, 'campBooking'),
      where('email', '==', email),
      where('numeroDeReservation', '==', numeroDeReservation)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
    }

    // Normalement, on s’attend à une seule réservation qui match
    const docSnap = snap.docs[0];
    const data = docSnap.data();

    // Construire l'URL vers la page /reservation/[tokenUnique]
    const lienAcces = `${process.env.NEXT_PUBLIC_APP_URL}/reservation/${data.tokenUnique}`;

    // Option A: on REnvoie juste le lien, et le front l’affiche ou l’envoie par mail
    return NextResponse.json({ lienAcces });

    // Option B: on appelle /api/send-email ici pour envoyer le mail
    // ...
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
