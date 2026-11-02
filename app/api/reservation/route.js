"use server";

import { NextResponse } from "next/server";
import { db, storage } from "@/app/firebase"; // Assurez-vous que le client Firebase fonctionne en SSR
import { collection, addDoc, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { isPublicBookableSession, sejourIdCandidates } from "@/src/lib/availability";
import {
  computeSessionOccupancy,
  legacyWeekOf,
  matchReservationTransports,
  normalizeReservationStatus,
  reservationSessionKey,
  sessionFillState,
} from "@/src/lib/reservations";
import crypto from "crypto";

function sessionCapacity(sessionEntry, sejourData) {
  return Number(sessionEntry?.capacity ?? sessionEntry?.maxChildren ?? sejourData?.maxChildren ?? 0) || 0;
}

/** Occupancy of every session of a s\u00e9jour (archived files excluded), keyed by sessionId. */
async function sejourOccupancy(sejourId) {
  const snap = await getDocs(query(collection(db, "reservations"), where("sejour.id", "==", sejourId)));
  return computeSessionOccupancy(
    snap.docs.map((entry) => entry.data()).filter((data) => data.archived !== true),
  );
}

async function syncReservationToMatchingTransports(reservationId, reservation, legacyWeek) {
  if (normalizeReservationStatus(reservation.status) !== "validated") return 0;
  const transportsSnap = await getDocs(collection(db, "transports"));
  const transports = transportsSnap.docs.map((transportDoc) => ({ id: transportDoc.id, ...transportDoc.data() }));
  let synced = 0;
  for (const { transport, city } of matchReservationTransports(transports, reservation, { legacyWeek })) {
    const passengers = Array.isArray(transport.passengers) ? transport.passengers : [];
    if (passengers.some((passenger) => passenger.reservationId === reservationId)) continue;
    await updateDoc(doc(db, "transports", transport.id), {
      passengers: [...passengers, { reservationId, pickupCity: city }],
      updatedAt: new Date().toISOString(),
    });
    synced += 1;
  }
  return synced;
}

/**
 * GET /api/reservation?sejour=<id> \u2014 public fill state of a s\u00e9jour's sessions, so the booking
 * pages can show "Liste d'attente" without reading the reservations themselves.
 */
export async function GET(request) {
  try {
    const sejourParam = new URL(request.url).searchParams.get("sejour") || "";
    let sejourId = "";
    let sejourData = null;
    for (const candidate of sejourIdCandidates(sejourParam)) {
      const sejourSnap = await getDoc(doc(db, "sejours", candidate));
      if (sejourSnap.exists()) {
        sejourId = candidate;
        sejourData = sejourSnap.data();
        break;
      }
    }
    if (!sejourData) return NextResponse.json({ sessions: [] }, { status: 404 });
    const occupancy = await sejourOccupancy(sejourId);
    const sessions = (sejourData.dates || []).map((entry) => {
      const startDate = String(entry.startDate || "").slice(0, 10);
      const state = sessionFillState(
        sessionCapacity(entry, sejourData),
        occupancy.get(reservationSessionKey(sejourId, startDate)),
      );
      return { startDate, endDate: String(entry.endDate || "").slice(0, 10), full: state.full, remaining: state.remaining };
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Erreur lecture des disponibilit\u00e9s:", error);
    return NextResponse.json({ sessions: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    // ───────────────────────────────────────────────
    // 1) Récupérer le FormData (PDF + JSON)
    // ───────────────────────────────────────────────
    const data = await request.formData();

    const fields = data.get("fields");
    if (!fields) {
      return NextResponse.json(
        { error: "Aucun champ JSON (fields)" },
        { status: 400 }
      );
    }
    const body = JSON.parse(fields);
    // The booking page sends the chosen session as `sessionId` ("<sejourId>__<startDate>"); the
    // séjour and dates in the URL are kept as a fallback for links built before 2027.
    const [sessionSejour = "", sessionStart = ""] = String(body.sessionId || "").split("__");
    const requestedStartDate = String(sessionStart || body.urlStartDate || "").slice(0, 10);
    const requestedEndDate = String(body.urlEndDate || "").slice(0, 10);
    let requestedSejour = "";
    let sejourData = null;
    for (const candidate of sejourIdCandidates(sessionSejour || body.urlSejour)) {
      const sejourSnap = await getDoc(doc(db, "sejours", candidate));
      if (sejourSnap.exists()) {
        requestedSejour = candidate;
        sejourData = sejourSnap.data();
        break;
      }
    }
    let selectedSession = null;
    let reservationStatus = "pending";
    if ((sessionSejour || body.urlSejour) && requestedStartDate) {
      selectedSession = (sejourData?.dates || []).find(
        (dateEntry) => (
          String(dateEntry.startDate || "").slice(0, 10) === requestedStartDate
          && (sessionStart || String(dateEntry.endDate || "").slice(0, 10) === requestedEndDate)
        ),
      ) || null;
      if (!isPublicBookableSession(requestedSejour, selectedSession)) {
        return NextResponse.json(
          { error: "Cette session n'est plus disponible (complète ou déjà commencée). Choisissez une autre session." },
          { status: 409 },
        );
      }

      // Capacity: a request that no longer fits next to the validated children is still recorded,
      // as "waitlist", so the family keeps its place in line if a validated file is cancelled.
      // No deposit link is sent for it. A session closed by hand (bookingOpen false / "full")
      // stays refused above.
      const capacity = sessionCapacity(selectedSession, sejourData);
      if (capacity > 0) {
        try {
          const occupancy = await sejourOccupancy(requestedSejour);
          const state = sessionFillState(capacity, occupancy.get(reservationSessionKey(requestedSejour, requestedStartDate)));
          const requestedChildren = Math.max(Number.parseInt(body.childCount || body.numberOfChildren || 1, 10) || 1, 1);
          if (state.validated + requestedChildren > capacity) reservationStatus = "waitlist";
        } catch (error) {
          // Counting must never block a booking: keep it as an ordinary request.
          console.error("Occupation de la session illisible:", error);
        }
      }
    }

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

    // E) Informations sur le séjour, rattachées à leur session (docs/MODELE-DONNEES.md §4)
    const sessionStartDate = String(selectedSession?.startDate || urlStartDate || "").slice(0, 10);
    const sessionEndDate = String(selectedSession?.endDate || urlEndDate || "").slice(0, 10);
    const sejourId = requestedSejour || urlSejour;
    const safeSejour = {
      id: sejourId,
      name: sejourData?.name || urlSejour,
      startDate: sessionStartDate,
      endDate: sessionEndDate,
      ageGroup: urlAgeGroup,
      sessionId: reservationSessionKey(sejourId, sessionStartDate),
    };
    const legacyWeek = legacyWeekOf(sejourData?.dates, sessionStartDate);

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
      status: reservationStatus,
      season: sessionStartDate.slice(0, 4),
      numeroDeReservation,
    };
    const isWaitlist = reservationStatus === "waitlist";

    // ───────────────────────────────────────────────
    // 6) ENREGISTRER LA RÉSERVATION DANS FIRESTORE
    // ───────────────────────────────────────────────
    const docRef = await addDoc(collection(db, "reservations"), newReservation);
    await syncReservationToMatchingTransports(docRef.id, newReservation, legacyWeek);

    // ───────────────────────────────────────────────
    // 7) CRÉER LA SESSION STRIPE ACOMPTE (100€) — pas pour la liste d'attente
    // ───────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const lienAcces = `${baseUrl}/reservation/${tokenUnique}`;

    let stripeDepositUrl = null;
    if (!isWaitlist) try {
      const stripeRes = await fetch(`${baseUrl}/api/create-stripe-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUnique,
          amount: 100,
          currency: "eur",
          sejourTitle: sejourData?.name || urlSejour,
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
        waitlist: isWaitlist,
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
      status: reservationStatus,
      sessionId: safeSejour.sessionId,
    });
  } catch (error) {
    console.error("Erreur lors de la création de la réservation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
