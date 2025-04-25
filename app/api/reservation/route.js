"use server";

import { NextResponse } from "next/server";
import { db, storage } from "@/app/firebase"; // Assurez-vous que le client Firebase fonctionne en SSR
import { collection, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import crypto from "crypto";

export async function POST(request) {
  try {
    // ───────────────────────────────────────────────
    // 1) Récupérer le FormData (PDF + JSON)
    // ───────────────────────────────────────────────
    const data = await request.formData();

    // Récupération du PDF (justificatif) s'il est fourni
    const file = data.get("file");
    let pdfUrl = "";
    if (file && file.name) {
      const arrayBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(arrayBuffer);
      const uniqueFileName = `${Date.now()}-${file.name}`;
      const fileRef = ref(storage, `justificatifs/${uniqueFileName}`);
      await uploadBytes(fileRef, fileBytes);
      pdfUrl = await getDownloadURL(fileRef);
    }

    // Récupération du champ JSON contenant toutes les infos
    const fields = data.get("fields");
    if (!fields) {
      return NextResponse.json(
        { error: "Aucun champ JSON (fields)" },
        { status: 400 }
      );
    }
    const body = JSON.parse(fields);

    // ───────────────────────────────────────────────
    // 2) EXTRAIRE LES DONNÉES PASSÉES À L'API
    // ───────────────────────────────────────────────
    const {
      // Informations sur le(s) enfant(s)
      minor = {},
      // Coordonnées et informations du responsable légal
      legal = {},
      // Options / consentements
      insuranceOpted = false,
      acceptedCGV = false,
      acceptedDocs = false,
      acceptedNoWithdrawal = false,
      acceptedRGPD = false,
      // Infos de paiement
      paymentMethod = "CB",
      paymentStatus = "not_paid",
      computedTotalPrice = 0,
      insuranceFee = 0,
      transportFee = 0,
      estimatedPriceString = "",
      // Informations sur le séjour
      urlSejour = "",
      urlStartDate = "",
      urlEndDate = "",
      urlAgeGroup = "",
      // Villes de départ et de retour
      departureCity = "",
      returnCity = "",
      // Nombre d'enfants
      numberOfChildren = "1",
    } = body;

    // ───────────────────────────────────────────────
    // 3) CONSTRUIRE LES OBJETS SANS undefined
    // ───────────────────────────────────────────────
    // A) Informations sur le(s) enfant(s)
    const safeMinor = {
      numberOfChildren,
      children: minor.children || [],
    };

    // B) Coordonnées du responsable légal (avec l'URL du PDF uploadé)
    const safeLegal = {
      firstName: legal.firstName || "",
      lastName: legal.lastName || "",
      phone: legal.phone || "",
      email: legal.email || "",
      relation: legal.relation || "",
      relationOther: legal.relationOther || "",
      addressDifferent: legal.addressDifferent || false,
      address: legal.address || "",
      city: legal.city || "",
      postalCode: legal.postalCode || "",
      promoCode: legal.promoCode || "",
      cafOrSecu: legal.cafOrSecu || "",
      justificatifUrl: pdfUrl,
      message: legal.message || "",
    };

    // C) Options et consentements
    const safeOptions = {
      insuranceOpted,
      paymentMethod,
      acceptedCGV,
      acceptedDocs,
      acceptedNoWithdrawal,
      acceptedRGPD,
    };

    // D) Informations de paiement
    const safePayment = {
      totalPrice: Number(computedTotalPrice) || 0,
      estimatedPriceString,
      basePrice: Number(computedTotalPrice) || 0,
      transportFee: Number(transportFee) || 0,
      insuranceFee: insuranceOpted ? Number(insuranceFee) : 0,
      paymentStatus,
      alreadyPaid: 0,
    };

    // E) Informations sur le séjour
    const safeSejour = {
      name: urlSejour,
      startDate: urlStartDate,
      endDate: urlEndDate,
      ageGroup: urlAgeGroup,
    };

    // F) Informations de transport (villes de départ et de retour)
    const safeTransport = {
      departureCity,
      returnCity,
      fee: Number(transportFee) || 0,
    };

    // Vérification minimale : l'email du responsable légal est obligatoire
    if (!safeLegal.email) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    // ───────────────────────────────────────────────
    // 4) GÉNÉRER UN IDENTIFIANT UNIQUE ET UN NUMÉRO DE RÉSERVATION
    // ───────────────────────────────────────────────
    const tokenUnique = crypto.randomBytes(16).toString("hex");
    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const lastNamePart = safeLegal.lastName.substring(0, 3).toUpperCase();
    const numeroDeReservation = `RES-${day}${month}${lastNamePart}`;

    // ───────────────────────────────────────────────
    // 5) CONSTRUIRE L'OBJET DE RÉSERVATION
    // ───────────────────────────────────────────────
    const newReservation = {
      minor: safeMinor,
      legal: safeLegal,
      options: safeOptions,
      payment: safePayment,
      sejour: safeSejour,
      transport: safeTransport,
      tokenUnique,
      createdAt: new Date().toISOString(),
      status: "pending",
      numeroDeReservation,
    };

    // ───────────────────────────────────────────────
    // 6) ENREGISTRER LA RÉSERVATION DANS FIRESTORE
    // ───────────────────────────────────────────────
    const docRef = await addDoc(collection(db, "reservations"), newReservation);

    // ───────────────────────────────────────────────
    // 7) ENVOYER UN EMAIL DE CONFIRMATION
    // ───────────────────────────────────────────────
    // On construit l'URL d'accès à la réservation (baseUrl défini dans l'environnement)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const lienAcces = `${baseUrl}/reservation/${tokenUnique}`;

    // Appel de l'API d'envoi d'email (vous pouvez adapter l'URL ou le endpoint)
    const sendMailRes = await fetch(`${baseUrl}/api/mail-resa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formType: "reservation",
        reservationId: docRef.id,
        numeroDeReservation,
        lienAcces,
        minor: newReservation.minor,
        legal: newReservation.legal,
        options: newReservation.options,
        payment: newReservation.payment, // contient basePrice, depositValue, insuranceFee, totalPrice, transportFee, etc.
        sejour: newReservation.sejour,
        transport: newReservation.transport,
        estimatedPriceString: newReservation.payment.estimatedPriceString // estimation du prix (texte)
      }),
    });

    if (!sendMailRes.ok) {
      console.error("Erreur lors de l'envoi d'email:", await sendMailRes.text());
    }

    // ───────────────────────────────────────────────
    // 8) RÉPONDRE
    // ───────────────────────────────────────────────
    return NextResponse.json({
      message: "Réservation créée avec succès",
      reservationId: docRef.id,
      tokenUnique,
      justificatifUrl: pdfUrl,
    });
  } catch (error) {
    console.error("Erreur lors de la création de la réservation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
