// app/api/campBooking/new/route.js
"use server";

import { NextResponse } from "next/server";
import { db } from "@/app/firebase";
import { collection, addDoc } from "firebase/firestore";
import crypto from "crypto";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      email,
      mineur,
      responsable,
      acompte,
      resteAPayer,
      selectedDate,
      selectedCity,
      selectedAgeGroup,
      reservationPrice,
    } = body;

    if (!email) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    // Générer un numéro de réservation
    const numeroDeReservation = `RES-${Date.now()}`; // ex: timestamp
    // Générer un token unique
    const tokenUnique = crypto.randomBytes(16).toString("hex");

    // Construire l'objet à insérer
    const newBooking = {
      email,
      mineur,
      responsable,
      acompte,
      resteAPayer,
      numeroDeReservation,
      tokenUnique,
      createdAt: new Date().toISOString(),
      selectedDate,
      selectedCity,
      selectedAgeGroup,
      reservationPrice,
      // etc. selon tes besoins
    };

    // Ajouter dans la collection "campBooking"
    const docRef = await addDoc(collection(db, "campBooking"), newBooking);

    // Construire le lien d'accès
    const lienAcces = `http://localhost:3000/reservation/${tokenUnique}`;

    // On renvoie l'info au front
    return NextResponse.json({
      message: "Réservation créée",
      lienAcces,
      reservationId: docRef.id,
      numeroDeReservation,
      tokenUnique,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
