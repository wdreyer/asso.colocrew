import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  calculateReservationPriceRange,
  formatPriceRange,
  normalizeChildCount,
  resolveSejourPriceRange,
  siblingDiscountFactor,
} from "../src/lib/pricing.js";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const onlyMultiChildren = !process.argv.includes("--all");

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    });

const db = getFirestore(app);
const reservationsSnapshot = await getDocs(collection(db, "reservations"));
const sejourCache = new Map();
const updates = [];
const skipped = [];

for (const reservationDoc of reservationsSnapshot.docs) {
  const reservation = reservationDoc.data() || {};
  const childCount = getChildCount(reservation);

  if (onlyMultiChildren && childCount < 2) {
    skipped.push({ id: reservationDoc.id, reason: "single-child" });
    continue;
  }

  const sejourName = reservation.sejour?.name || "";
  const sejour = await getSejour(sejourName, sejourCache);
  const storedPayment = reservation.payment || {};
  const baseRange = sejour
    ? resolveSejourPriceRange(sejour, reservation.sejour?.startDate || "")
    : {
        min: Number(storedPayment.basePriceMin) || Number(storedPayment.basePrice) || 0,
        max: Number(storedPayment.basePriceMax) || Number(storedPayment.basePrice) || 0,
      };

  if (!(baseRange.min > 0 || baseRange.max > 0)) {
    skipped.push({ id: reservationDoc.id, reason: "missing-base-price", sejourName });
    continue;
  }

  const discountFactor = siblingDiscountFactor(childCount);
  const flatDiscount = promoFlatDiscount(reservation);
  const transportFee = Number(reservation.transport?.fee ?? storedPayment.transportFee ?? 0) || 0;
  const insuranceFee = reservation.options?.insuranceOpted
    ? Number(storedPayment.insuranceFee || 0)
    : 0;

  const nextRange = calculateReservationPriceRange(baseRange, {
    childCount,
    discountFactor,
    transportFee,
    insuranceFee,
    flatDiscount,
  });
  const nextEstimatedPriceString = `de ${formatPriceRange(nextRange)}`;
  const previousMin = Number(storedPayment.estimatedPriceMin || 0);
  const previousMax = Number(storedPayment.estimatedPriceMax || 0);

  if (isSameMoney(previousMin, nextRange.min) && isSameMoney(previousMax, nextRange.max)) {
    skipped.push({ id: reservationDoc.id, reason: "unchanged", childCount });
    continue;
  }

  updates.push({
    id: reservationDoc.id,
    numeroDeReservation: reservation.numeroDeReservation || "",
    sejourName,
    childCount,
    previous: {
      min: roundMoney(previousMin),
      max: roundMoney(previousMax),
      label: storedPayment.estimatedPriceString || "",
    },
    next: {
      min: roundMoney(nextRange.min),
      max: roundMoney(nextRange.max),
      label: nextEstimatedPriceString,
    },
    patch: {
      "minor.numberOfChildren": String(childCount),
      "payment.estimatedPriceString": nextEstimatedPriceString,
      "payment.estimatedPriceMin": roundMoney(nextRange.min),
      "payment.estimatedPriceMax": roundMoney(nextRange.max),
      "payment.basePrice": roundMoney(nextRange.max),
      "payment.basePriceMin": roundMoney(baseRange.min),
      "payment.basePriceMax": roundMoney(baseRange.max),
      "payment.childCount": childCount,
      "payment.discountFactor": discountFactor,
      "payment.flatDiscount": flatDiscount,
      updatedAt: serverTimestamp(),
    },
  });
}

if (shouldApply) {
  for (const update of updates) {
    await updateDoc(doc(db, "reservations", update.id), update.patch);
  }
}

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      scope: onlyMultiChildren ? "multi-children" : "all-reservations",
      updates: updates.map(({ patch, ...item }) => item),
      skippedCount: skipped.length,
      skippedReasons: skipped.reduce((result, item) => {
        result[item.reason] = (result[item.reason] || 0) + 1;
        return result;
      }, {}),
    },
    null,
    2,
  ),
);

process.exit(0);

async function getSejour(sejourName, cache) {
  const slug = slugify(sejourName);
  if (!slug) return null;
  if (cache.has(slug)) return cache.get(slug);
  const snap = await getDoc(doc(db, "sejours", slug));
  const data = snap.exists() ? snap.data() : null;
  cache.set(slug, data);
  return data;
}

function getChildCount(reservation) {
  const children = reservation.minor?.children;
  if (Array.isArray(children) && children.length > 0) return children.length;
  return normalizeChildCount(reservation.minor?.numberOfChildren);
}

function promoFlatDiscount(reservation) {
  const promoCode = String(reservation.legal?.promoCode || "").trim().toUpperCase();
  return promoCode === "NOEL" ? 50 : Number(reservation.payment?.flatDiscount || 0) || 0;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSameMoney(left, right) {
  return roundMoney(left) === roundMoney(right);
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
