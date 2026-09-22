import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getDoc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");
const sourceDir = "I:/Shared drives/ColoCrew/Séjours/Eté 26/Transport/Convoyages 3 août";

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);
const storage = getStorage(app);

const transportIds = {
  north: "gYSCIzh4y1VbVojTAEzi",
  south: "ZE9pRIszXarAjRBoQqhz",
};

const [northSnap, southSnap] = await Promise.all([
  getDoc(doc(db, "transports", transportIds.north)),
  getDoc(doc(db, "transports", transportIds.south)),
]);
if (!northSnap.exists()) throw new Error(`Transport introuvable : ${transportIds.north}`);
if (!southSnap.exists()) throw new Error(`Transport introuvable : ${transportIds.south}`);

const transports = {
  north: { id: northSnap.id, ...northSnap.data() },
  south: { id: southSnap.id, ...southSnap.data() },
};

const achouriId = (transports.south.passengers || []).find((passenger) =>
  normalizeKey(`${passenger.childName || ""} ${passenger.nom || ""}`).includes("achourimohamedamine")
  || normalizeKey(`${passenger.nom || ""} ${passenger.childName || ""}`).includes("mohamedamineachouri")
)?.reservationId;

const ticketsByTransport = {
  north: [
    {
      fileName: "mhlZBCmKcR_M4OcRdbkKKQ.pdf",
      id: "s3-aller-paris-bordeaux-fx6lnx-extra",
      segmentId: "s3-aller-paris-bordeaux",
      name: "TGV INOUI 8449 - Paris Montparnasse > Bordeaux Saint-Jean - complément FX6LNX",
      from: "Paris",
      to: "Bordeaux",
      coverageFrom: "Paris",
      coverageTo: "Bordeaux",
      date: "2026-08-03",
      trainType: "TGV INOUI",
      trainNumber: "8449",
      departureTime: "16:39",
      arrivalTime: "20:06",
      seats: 10,
      price: 255,
      bookingReference: "FX6LNX",
      externalReference: "FX6LNX",
      coveredReservationIds: [],
      coveredStaffIds: [],
      notes: "Billet groupe enfants complémentaire, 10 places, sur le segment Paris > Bordeaux.",
    },
    {
      fileName: "eto-ca961aa4-9617-4d18-8f8c-f8f0949ad5bc.pdf",
      id: "s3-positioning-axel-shirley-dax-bordeaux-vt389581",
      segmentId: "s3-positioning-axel-shirley-dax-bordeaux-vt389581",
      segmentLabel: "Positionnement staff - Dax > Bordeaux",
      name: "Positionnement staff - Axel Raharinosy + Shirley Siousarram Annerose - Dax > Bordeaux",
      from: "Dax",
      to: "Bordeaux",
      coverageFrom: "Dax",
      coverageTo: "Bordeaux",
      date: "2026-08-03",
      trainType: "TER",
      trainNumber: "",
      departureTime: "",
      arrivalTime: "",
      seats: 2,
      price: 49.2,
      bookingReference: "VT389581",
      externalReference: "VT389581",
      coveredReservationIds: [],
      coveredStaffIds: ["d48753c6-15d3-46d1-9ae1-0bc30c0d331f", "95a24984-67c5-41ef-8a57-92a85284c60d"],
      staffPositioning: true,
      notes: "Billet TER staff pour Axel et Shirley. L'horaire précis n'est pas lisible dans le PDF extrait.",
    },
    {
      fileName: "vmEAkNLtgFoGx4Qa57LV2g.pdf",
      id: "s3-extra-shirley-axelle-bordeaux-dax-jkgsyv",
      segmentId: "s3-extra-shirley-axelle-bordeaux-dax-jkgsyv",
      segmentLabel: "Billet annexe staff - Bordeaux > Dax",
      name: "Billet annexe staff - Shirley + Axelle - Bordeaux > Dax",
      from: "Bordeaux",
      to: "Dax",
      coverageFrom: "Bordeaux",
      coverageTo: "Dax",
      date: "2026-08-03",
      trainType: "TGV INOUI",
      trainNumber: "8551",
      departureTime: "20:53",
      arrivalTime: "22:06",
      seats: 10,
      price: 230,
      bookingReference: "JKGSYV",
      externalReference: "JKGSYV",
      coveredReservationIds: [],
      coveredStaffIds: ["95a24984-67c5-41ef-8a57-92a85284c60d", "065cb0e2-9a2a-497a-ae33-ae84b01793cf"],
      staffPositioning: true,
      notes: "Billet ajouté en plus pour Shirley et Axelle, 10 places Bordeaux > Dax.",
    },
  ],
  south: [
    {
      fileName: "B_ZIERS-TOULOUSE_MATABIAU_03-08-26_MOHAMED_AMINE_ACHOURI_AFZFMG_AhVQwVFww2wWXrWonNh2.pdf",
      id: "s3-aller-beziers-toulouse-achouri-afzfmg",
      segmentId: "s3-aller-lyon-toulouse",
      name: "TGV INOUI 6823 - Béziers > Toulouse Matabiau - Mohamed-Amine Achouri",
      from: "Béziers",
      to: "Toulouse",
      coverageFrom: "Béziers",
      coverageTo: "Toulouse",
      date: "2026-08-03",
      trainType: "TGV INOUI",
      trainNumber: "6823",
      departureTime: "14:49",
      arrivalTime: "16:20",
      seats: 1,
      price: 36,
      bookingReference: "AFZFMG",
      externalReference: "AFZFMG",
      coveredReservationIds: achouriId ? [achouriId] : [],
      coveredStaffIds: [],
      seat: "Voiture 17 Haut - Place 780",
      notes: "Billet individuel Mohamed-Amine Achouri, montée Béziers sur le segment Lyon > Toulouse.",
    },
  ],
};

for (const [key, ticketSpecs] of Object.entries(ticketsByTransport)) {
  const transport = transports[key];
  const uploadedTickets = [];
  for (const spec of ticketSpecs) {
    const sourcePath = path.join(sourceDir, spec.fileName);
    if (!fs.existsSync(sourcePath)) throw new Error(`PDF introuvable : ${sourcePath}`);
    const storagePath = `transports/${transport.id}/billets/2026-08-03-${spec.id}.pdf`;
    let url = "";
    if (shouldApply) {
      const uploaded = await uploadBytes(ref(storage, storagePath), fs.readFileSync(sourcePath), {
        contentType: "application/pdf",
      });
      url = await getDownloadURL(uploaded.ref);
    }
    uploadedTickets.push({
      ...spec,
      url,
      storagePath,
      uploadedFileName: spec.fileName,
      segmentLabel: spec.segmentLabel || `${spec.from} > ${spec.to}`,
      purchased: true,
      option: false,
      updatedAt: new Date().toISOString(),
    });
  }

  const ids = new Set(uploadedTickets.map((ticket) => ticket.id));
  const nextTickets = [
    ...(transport.tickets || []).filter((ticket) => !ids.has(ticket.id)),
    ...uploadedTickets,
  ];

  console.log(`${shouldApply ? "APPLICATION" : "SIMULATION"} - ${transport.sejourName || transport.id}`);
  for (const ticket of uploadedTickets) {
    console.log(`- ${ticket.name} | ${ticket.from} -> ${ticket.to} | ${ticket.departureTime || "?"}-${ticket.arrivalTime || "?"} | ${ticket.seats} place(s) | ref ${ticket.bookingReference}`);
  }

  if (shouldApply) {
    await updateDoc(doc(db, "transports", transport.id), {
      tickets: nextTickets,
      updatedAt: serverTimestamp(),
    });
  }
}

if (shouldApply) console.log("Firestore + Storage mis à jour.");
else console.log("Simulation uniquement. Relancer avec --apply pour enregistrer.");

process.exit(0);

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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
