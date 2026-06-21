"use server";

import { NextResponse } from "next/server";
import { db, storage } from "@/app/firebase"; // Assurez-vous que le client Firebase fonctionne en SSR
import { collection, addDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import crypto from "crypto";

function normalizePlace(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function weekFromStartDate(value) {
  const date = String(value || "").slice(0, 10);
  return { "2026-07-06": "S1", "2026-07-20": "S2", "2026-08-03": "S3", "2026-08-17": "S4" }[date] || "";
}

function transportStopCities(transport) {
  const cities = new Set();
  (transport.segments || []).forEach((segment) => {
    [segment.from, segment.to].filter(Boolean).forEach((city) => cities.add(city));
  });
  if (transport.departureCity) cities.add(transport.departureCity);
  if (transport.arrivalCity) cities.add(transport.arrivalCity);
  return [...cities];
}

function reservationPassengerPayload(reservationId, reservation) {
  const children = Array.isArray(reservation.minor?.children) ? reservation.minor.children : [];
  const first = children[0] || {};
  return {
    reservationId,
    numeroDeReservation: reservation.numeroDeReservation || "",
    nom: `${reservation.legal?.firstName || ""} ${reservation.legal?.lastName || ""}`.trim(),
    email: reservation.legal?.email || "",
    phone: reservation.legal?.phone || "",
    children,
    childName: `${first.firstName || ""} ${first.lastName || ""}`.trim(),
    sejourName: reservation.sejour?.name || "",
    departureCity: reservation.transport?.departureCity || "",
    returnCity: reservation.transport?.returnCity || "",
  };
}

async function syncReservationToMatchingTransports(reservationId, reservation) {
  if (normalizePlace(reservation.status) !== "validated") return 0;
  const week = weekFromStartDate(reservation.sejour?.startDate);
  if (!week) return 0;
  const passengerBase = reservationPassengerPayload(reservationId, reservation);
  const transportsSnap = await getDocs(collection(db, "transports"));
  const transports = transportsSnap.docs.map((transportDoc) => ({ id: transportDoc.id, ...transportDoc.data() }));
  let synced = 0;

  for (const direction of ["aller", "retour"]) {
    const city = direction === "retour" ? passengerBase.returnCity : passengerBase.departureCity;
    if (!city || normalizePlace(city) === "sur place") continue;
    const matches = transports.filter((transport) =>
      transport.week === week
      && transport.direction === direction
      && normalizePlace(transport.status) !== "annule"
      && transportStopCities(transport).some((stopCity) => normalizePlace(stopCity) === normalizePlace(city))
    );
    if (matches.length !== 1) continue;
    const transport = matches[0];
    const passengers = Array.isArray(transport.passengers) ? transport.passengers : [];
    if (passengers.some((passenger) => passenger.reservationId === reservationId)) continue;
    await updateDoc(doc(db, "transports", transport.id), {
      passengers: [...passengers, { ...passengerBase, pickupCity: city }],
      updatedAt: new Date().toISOString(),
    });
    synced += 1;
  }
  return synced;
}

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
      computedTotalPriceMin = 0,
      computedTotalPriceMax = 0,
      basePriceMin = 0,
      basePriceMax = 0,
      childCount = 1,
      discountFactor = 1,
      flatDiscount = 0,
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
    const normalizedChildCount = Math.max(
      Number.parseInt(childCount || numberOfChildren || 1, 10) || 1,
      1,
    );

    // ───────────────────────────────────────────────
    // 3) CONSTRUIRE LES OBJETS SANS undefined
    // ───────────────────────────────────────────────
    // A) Informations sur le(s) enfant(s)
    const safeMinor = {
      numberOfChildren: String(normalizedChildCount),
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
      qf: legal.qf || "",   
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
    const numericEstimatedMin = Number(computedTotalPriceMin) || 0;
    const numericEstimatedMax = Number(computedTotalPriceMax) || 0;
    const numericBaseMin = Number(basePriceMin) || 0;
    const numericBaseMax = Number(basePriceMax) || 0;

    const safePayment = {
      totalPrice: 0,
      validatedPrice: 0,
      priceStatus: "estimated",
      estimatedPriceString,
      estimatedPriceMin: numericEstimatedMin,
      estimatedPriceMax: numericEstimatedMax,
      basePrice: Number(computedTotalPrice) || numericBaseMax || numericBaseMin || 0,
      basePriceMin: numericBaseMin,
      basePriceMax: numericBaseMax,
      childCount: normalizedChildCount,
      discountFactor: Number(discountFactor) || 1,
      flatDiscount: Number(flatDiscount) || 0,
      transportFee: Number(transportFee) || 0,
      insuranceFee: insuranceOpted ? Number(insuranceFee) : 0,
      paymentStatus,
      alreadyPaid: 0,
      remainingValue: null,
      depositAmount: 100,
      depositStatus: "pending",
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
    const syncedTransports = await syncReservationToMatchingTransports(docRef.id, newReservation);

    // ───────────────────────────────────────────────
    // 7) CRÉER LA SESSION STRIPE ACOMPTE (100€)
    // ───────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const lienAcces = `${baseUrl}/reservation/${tokenUnique}`;

    let stripeDepositUrl = null;
    try {
      const stripeRes = await fetch(`${baseUrl}/api/create-stripe-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUnique,
          amount: 100,
          currency: "eur",
          sejourTitle: urlSejour,
          ageGroup: urlAgeGroup,
          startDate: urlStartDate,
          endDate: urlEndDate,
          transportFee: Number(transportFee) || 0,
          insuranceOpted,
          paymentOption: "deposit",
          customer_email: safeLegal.email,
          metadata: {
            paymentType: "deposit",
            numeroDeReservation,
          },
        }),
      });
      if (stripeRes.ok) {
        const stripeData = await stripeRes.json();
        stripeDepositUrl = stripeData.url || null;
        if (stripeDepositUrl) {
          await updateDoc(doc(db, "reservations", docRef.id), { stripeDepositUrl });
        }
      }
    } catch (err) {
      console.error("Erreur création session Stripe acompte:", err);
    }

    // ───────────────────────────────────────────────
    // 8) ENVOYER UN EMAIL DE CONFIRMATION
    // ───────────────────────────────────────────────
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
        payment: newReservation.payment,
        sejour: newReservation.sejour,
        transport: newReservation.transport,
        estimatedPriceString: newReservation.payment.estimatedPriceString,
        stripeDepositUrl,
      }),
    });

    if (!sendMailRes.ok) {
      console.error("Erreur lors de l'envoi d'email:", await sendMailRes.text());
    }

    // ───────────────────────────────────────────────
    // 9) RÉPONDRE
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
