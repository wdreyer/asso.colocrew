// app/api/reservation/route.js
"use server";

import { NextResponse } from "next/server";
import { db } from "@/app/firebase";
import { collection, addDoc } from "firebase/firestore";
import crypto from "crypto";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      // Données concernant le mineur
      minorFirstName,
      minorLastName,
      minorBirthDate,
      minorBirthPlace,
      minorAddress,
      minorCity,
      minorPostalCode,

      // Données concernant le responsable légal
      legalFirstName,
      legalLastName,
      legalPhone,
      legalEmail,
      legalRelation,
      legalRelationOther,
      legalAddressDifferent,
      legalAddress,
      legalCity,
      legalPostalCode: legalPostalCodeField,

      // Options d'assurance et de paiement
      insuranceOpted,
      insuranceFee,
      paymentMethod,
      paymentOption,
      depositValue,
      paymentStatus = "not_paid", // "à faire", "en cours", "payé"
      acceptedCGV,
      acceptedDocs,
      acceptedNoWithdrawal,

      // Données financières et autres
      computedTotalPrice,
      transportFee,
      urlCity,
      urlSejour,

      // Ajout : dates et tranche d'âge
      urlStartDate,
      urlEndDate,
      urlAgeGroup
    } = body;

    // Vérification minimale
    if (!legalEmail) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    // Calcul du prix
    const basePrice = Number(computedTotalPrice);
    const transportPrice = Number(transportFee);

    // Générer un numéro de réservation
    const numeroDeReservation = `RES-${Date.now()}`;

    // Générer un token unique
    const tokenUnique = crypto.randomBytes(16).toString("hex");

    // Construire l'objet de réservation
    const newReservation = {
      // Informations sur le mineur
      minor: {
        firstName: minorFirstName,
        lastName: minorLastName,
        birthDate: minorBirthDate,
        birthPlace: minorBirthPlace,
        address: minorAddress,
        city: minorCity,
        postalCode: minorPostalCode,
      },
      // Informations sur le responsable légal
      legal: {
        firstName: legalFirstName,
        lastName: legalLastName,
        phone: legalPhone,
        email: legalEmail,
        relation: legalRelation,
        relationOther: legalRelationOther,
        addressDifferent: legalAddressDifferent,
        address: legalAddress,
        city: legalCity,
        postalCode: legalPostalCodeField,
      },
      // Options
      options: {
        insuranceOpted,
        paymentMethod,
        paymentOption,
        acceptedCGV,
        acceptedDocs,
        acceptedNoWithdrawal,
      },
      // Informations financières
      payment: {
        basePrice,
        transportPrice,
        insuranceFee: insuranceOpted ? Number(insuranceFee) : 0,
        paymentFrequency: paymentOption,
        depositValue: depositValue.toFixed(2),
        remainingValue: basePrice,
        paymentStatus,
        alreadyPaid: 0,
      },
      // Informations séjour, on y ajoute date de début, date de fin, tranche d'âge
      sejour: {
        urlSejour,   // ex: "Surf Camp"
        urlCity,     // ex: "Paris"
        startDate: urlStartDate, // ex: "2025-08-15"
        endDate: urlEndDate,     // ex: "2025-08-30"
        ageGroup: urlAgeGroup,   // ex: "11-13"
      },
      // Documents
      documents: {
        ficheSanitaire: { uploaded: false, url: "" },
        traitementsOrdonnances: { uploaded: false, url: "" },
        photocopieCarnetVaccination: { uploaded: false, url: "" },
        conditionsVentes: { uploaded: false, url: "" },
        charteParticipant: { uploaded: false, url: "" },
        photocopieIdentite: { uploaded: false, url: "" },
        passNautique: { uploaded: false, url: "" },
        attestationResponsabiliteCivile: { uploaded: false, url: "" },
        attestationComplementaireSante: { uploaded: false, url: "" },
        ficheInscription: { uploaded: false, url: "" }
      },
      // Système
      numeroDeReservation,
      tokenUnique,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    // 1) Enregistrement Firebase
    const docRef = await addDoc(collection(db, "reservations"), newReservation);

    // 2) Construire un lien d'accès
    const lienAcces = `http://localhost:3000/reservation/${tokenUnique}`;

    // 3) Appeler l'envoi d'email
    const sendMailRes = await fetch("http://localhost:3000/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formType: "reservation",
        // Champs pour le mail
        reservationId: docRef.id,
        numeroDeReservation,
        lienAcces,
        // Les mêmes objets qu'on vient de créer
        minor: newReservation.minor,
        legal: newReservation.legal,
        options: newReservation.options,
        payment: newReservation.payment,
        sejour: newReservation.sejour,
      }),
    });

    if (!sendMailRes.ok) {
      console.error("Erreur lors de l'envoi d'email", await sendMailRes.text());
    }

    // Renvoi de la réponse
    return NextResponse.json({
      message: "Réservation créée",
      lienAcces,
      reservationId: docRef.id,
      numeroDeReservation,
      tokenUnique,
    });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
