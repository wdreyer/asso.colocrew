"use server";

import { NextResponse } from "next/server";
import { db, storage } from "@/app/firebase"; // client SDK (assurez-vous qu'il marche en SSR)
import { collection, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import crypto from "crypto";

export async function POST(request) {
  try {
    // ─────────────────────────────────────────────────────
    // 1) RÉCUPÉRER LE FormData (PDF + JSON)
    // ─────────────────────────────────────────────────────
    const data = await request.formData();



    // Récupération du PDF
    const file = data.get("file");
    let pdfUrl = "";

    if (file && file.name) {
      // Convertir en ArrayBuffer puis en Uint8Array
      const arrayBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(arrayBuffer);

      // Nom unique
      const uniqueFileName = `${Date.now()}-${file.name}`;

      // Référence Storage
      const fileRef = ref(storage, `justificatifs/${uniqueFileName}`);

      // Upload
      await uploadBytes(fileRef, fileBytes);

      // URL de téléchargement
      pdfUrl = await getDownloadURL(fileRef);
    }

    // Récupération des champs JSON
    const fields = data.get("fields");
    if (!fields) {
      return NextResponse.json({ error: "Aucun champ JSON (fields)" }, { status: 400 });
    }

    const body = JSON.parse(fields);

    // ─────────────────────────────────────────────────────
    // 2) EXTRAIRE LES DONNÉES (AVEC VALEURS PAR DÉFAUT)
    // ─────────────────────────────────────────────────────
    const {
      // Objets
      minor = {},
      legal = {},
      // Booléens/options
      insuranceOpted = false,
      acceptedCGV = false,
      acceptedDocs = false,
      acceptedNoWithdrawal = false,
      acceptedRGPD = false,
      // Méthodes & status
      paymentMethod = "CB",
      paymentStatus = "not_paid",
      // Prix & calculs
      computedTotalPrice = 0,
      insuranceFee = 0,
      transportFee = 0,
      estimatedPriceString = "",
      // Séjour
      urlSejour = "",
      urlStartDate = "",
      urlEndDate = "",
      urlAgeGroup = "",
      // Villes
      departureCity = "",
      returnCity = "",
      // Nombre d'enfants
      numberOfChildren = "1",
    } = body;

    // ─────────────────────────────────────────────────────
    // 3) CONSTRUIRE LES OBJETS SANS undefined
    // ─────────────────────────────────────────────────────
    // A) mineur (plusieurs enfants)
    const safeMinor = {
      numberOfChildren,
      children: minor.children || [],
    };

    // B) legal (PDF dans justificatifUrl)
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
      justificatifUrl: pdfUrl, // URL PDF si upload
      message : legal.message || "",
    };

    // C) options (assurance, consentements)
    const safeOptions = {
      insuranceOpted,
      paymentMethod,
      acceptedCGV,
      acceptedDocs,
      acceptedNoWithdrawal,
      acceptedRGPD,
    };

    // D) payment
    const safePayment = {
      totalPrice: Number(computedTotalPrice) || 0,
      estimatedPriceString,
      basePrice: Number(computedTotalPrice) || 0, // vous pouvez ajuster si besoin
      transportFee: Number(transportFee) || 0,
      insuranceFee: insuranceOpted ? Number(insuranceFee) : 0,
      paymentStatus,
      alreadyPaid: 0,
    };

    // E) sejour
    const safeSejour = {
      name: urlSejour, // nom du séjour
      startDate: urlStartDate,
      endDate: urlEndDate,
      ageGroup: urlAgeGroup,
    };

    // F) transport (départ/arrivée)
    const safeTransport = {
      departureCity,
      returnCity,
      fee: Number(transportFee) || 0, // pour rappel
    };

    // ─────────────────────────────────────────────────────
    // Vérification minimale : email obligatoire
    // ─────────────────────────────────────────────────────
    if (!safeLegal.email) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    // ─────────────────────────────────────────────────────
    // 4) GÉNÉRER UNE RÉSERVATION
    // ─────────────────────────────────────────────────────
    const tokenUnique = crypto.randomBytes(16).toString("hex");
    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const lastNamePart = safeLegal.lastName.substring(0, 3).toUpperCase();
    const numeroDeReservation = `RES-${day}${month}${lastNamePart}`;

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
      numeroDeReservation
    };

    // ─────────────────────────────────────────────────────
    // 5) ENREGISTRER DANS FIRESTORE
    // ─────────────────────────────────────────────────────
    const docRef = await addDoc(collection(db, "reservations"), newReservation);

    // ─────────────────────────────────────────────────────
    // 6) RÉPONDRE (vous pouvez ajouter l'envoi d'email ici)
    // ─────────────────────────────────────────────────────
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






// documents: {
//   ficheSanitaire: { uploaded: false, url: "" },
//   traitementsOrdonnances: { uploaded: false, url: "" },
//   photocopieCarnetVaccination: { uploaded: false, url: "" },
//   conditionsVentes: { uploaded: false, url: "" },
//   charteParticipant: { uploaded: false, url: "" },
//   photocopieIdentite: { uploaded: false, url: "" },
//   passNautique: { uploaded: false, url: "" },
//   attestationResponsabiliteCivile: { uploaded: false, url: "" },
//   attestationComplementaireSante: { uploaded: false, url: "" },
//   ficheInscription: { uploaded: false, url: "" },
// },

    // ─────────────────────────────────────────────────────
    // 6) ENVOYER L'EMAIL DE CONFIRMATION
    // ─────────────────────────────────────────────────────
    // const lienAcces = `${baseUrl}/reservation/${tokenUnique}`;
    // const sendMailRes = await fetch(`${baseUrl}/api/send-email`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     formType: "reservation",
    //     reservationId: docRef.id,
    //     numeroDeReservation,
    //     lienAcces,
    //     minor: newReservation.minor,
    //     legal: newReservation.legal,
    //     options: newReservation.options,
    //     payment: newReservation.payment,
    //     sejour: newReservation.sejour,
    //   }),
    // });

    // if (!sendMailRes.ok) {
    //   console.error("Erreur lors de l'envoi d'email:", await sendMailRes.text());
    // }