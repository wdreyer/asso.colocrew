import fs from "node:fs";
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

loadEnv(".env.local");

const shouldApply = process.argv.includes("--apply");

const STRICT_RAW = `Depalle	Nilo
Depalle	Ethan
Aubrun	Egon
Javon Robellet	Maël
Pascot	Colin
Heffer	Aaron
MATHURIN	Jah Nah
RAMATCHANDIRIN	Rachel
MATHURIN	Jah-Lya
Bioulac	Zoé
Bachache	Lydia
FAHIM	Salma
FAHIM	Asma
EDJEHOU	Paule-Iris
Faramond	Charlotte
Faramond	Timothe
Hermosilla	Ines
Hermosilla	Léo
BERTRAND	Matthias
Rippling	Typhaine
DINDANGILA	Jahyan
Barvaut	Orlane
Gustave Dit Duflo	Maëlys
Eridan	Mayline
Boscher	Kyle
Thouard	Maxime
Luro	Apolline
Kehlaoui	Mohamed
	Denzel
PEDRON MALARTRE	Gabriel
BELKACEM	Mohamed
El Homrani	Anis
ERBILGIN	Buket
Ducheine	Lina
Hassani	Lina
BOUZIDI	Mohamed
ERBILGIN	Efe
ERGUN	Denis
GURBUZ	Mehmet
OUADAH	Djassim
SHAVESHYAN	Ramaz
Hamdane	Redwane
MOHAMED-AMINE	ACHOURI
SY	Issaga
Vidal	Joséphine
Vidal	Victor
Diallo	Lea
Bouhier fabre	Gianni
Le Rû	Louise
Lagathu	Capucine
ROUSSEAU AULO	Janis
FREY PILLET	ANABELLE
FREY PILLET	Ludivine
SACKO	Geidi
BOURGEOIS	Benjamin
LETELLIER	Jean
WERLEN	Jeanne
VALLOT-BAUDRY	Kiryan
ZOUON BI	David
GOLI	Chloé-Nohémie
Diallo	Khalifa
ZAIBI LOUIS	Syrine
GUEHILIZ	Naïl`;

const TRANSPORT_IDS = {
  allerNorth: "gYSCIzh4y1VbVojTAEzi",
  allerSouth: "ZE9pRIszXarAjRBoQqhz",
  allerBus: "s3-2026-bus-aller-autocar",
  retourNorth: "rvRWSjpmMcmht8Hka2gn",
  retourSouth: "MgRgEaP3Pv4riMtvpR3m",
  retourBus: "s3-2026-bus-retour-autocar",
};

const NORTH_CITIES = new Set(["paris", "lille", "nantes"]);
const SOUTH_CITIES = new Set(["lyon", "valence", "montpellier", "beziers", "bezier", "toulouse", "marseille"]);
const CHILD_TRANSPORT_OVERRIDES = {
  denzel: { departureCity: "Montpellier" },
};

const strictRows = STRICT_RAW.split(/\r?\n/).map((line, index) => {
  const [lastName = "", firstName = ""] = line.split("\t");
  return {
    line: index + 1,
    firstName: clean(firstName),
    lastName: clean(lastName),
    key: nameKey(firstName, lastName),
    label: `${clean(firstName)} ${clean(lastName)}`.trim(),
  };
});

const app = getApps()[0] || initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
});
const db = getFirestore(app);

const reservationSnap = await getDocs(collection(db, "reservations"));
const reservations = reservationSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
const transportSnap = await getDocs(collection(db, "transports"));
const transports = transportSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

const s3Reservations = reservations.filter((reservation) => weekFromReservation(reservation) === "S3" && !isDeletedStatus(reservation.status));
const strictKeys = new Set(strictRows.map((row) => row.key));

const matches = [];
const missingStrict = [];
for (const strict of strictRows) {
  const childMatches = childrenForReservations(s3Reservations)
    .filter((item) => item.key === strict.key)
    .sort((a, b) => scoreReservationMatch(b.reservation) - scoreReservationMatch(a.reservation));
  if (!childMatches.length) {
    missingStrict.push(strict);
    continue;
  }
  const chosen = childMatches[0];
  matches.push({ strict, ...chosen });
}

if (missingStrict.length) {
  console.log(JSON.stringify({ mode: shouldApply ? "apply" : "dry-run", error: "missing_strict_children", missingStrict }, null, 2));
  process.exit(1);
}

const matchedReservationIds = new Set(matches.map((item) => item.reservation.id));
const s3ActiveChildren = childrenForReservations(s3Reservations);
const validatedExtras = s3ActiveChildren
  .filter((item) => isValidatedStatus(item.reservation.status))
  .filter((item) => !strictKeys.has(item.key));

const duplicatePending = s3ActiveChildren
  .filter((item) => !matchedReservationIds.has(item.reservation.id))
  .filter((item) => strictKeys.has(item.key))
  .filter((item) => !isValidatedStatus(item.reservation.status));

const reservationsToDelete = new Map();
for (const item of duplicatePending) reservationsToDelete.set(item.reservation.id, item.reservation);

const expectedPassengers = buildExpectedPassengers(matches);
const transportPatches = Object.entries(TRANSPORT_IDS).map(([key, id]) => {
  const transport = transports.find((item) => item.id === id);
  const currentById = new Map((transport?.passengers || []).map((passenger) => [passenger.reservationId, passenger]));
  const passengers = dedupePassengers(expectedPassengers[key] || []).map((passenger) => ({
    ...currentById.get(passenger.reservationId),
    ...passenger,
    reservationId: passenger.reservationId,
    pickupCity: passenger.pickupCity,
    convocationSent: currentById.get(passenger.reservationId)?.convocationSent || false,
  }));
  return { id, key, passengers, transport };
});

if (shouldApply) {
  for (const reservation of reservationsToDelete.values()) {
    await updateDoc(doc(db, "reservations", reservation.id), {
      status: "deleted",
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletionReason: "Retiré de la liste stricte S3 du 30/07/2026",
    });
  }
  for (const patch of transportPatches) {
    await updateDoc(doc(db, "transports", patch.id), {
      passengers: patch.passengers,
      ...transportMetadataPatch(patch),
      updatedAt: serverTimestamp(),
      strictRosterSync: {
        source: "liste stricte utilisateur 30/07/2026",
        syncedAt: serverTimestamp(),
        children: countPassengerChildren(patch.passengers),
      },
    });
  }
  for (const item of matches) {
    const override = CHILD_TRANSPORT_OVERRIDES[item.strict.key];
    if (!override) continue;
    await updateDoc(doc(db, "reservations", item.reservation.id), {
      ...(override.departureCity ? { "transport.departureCity": override.departureCity } : {}),
      ...(override.returnCity ? { "transport.returnCity": override.returnCity } : {}),
      updatedAt: serverTimestamp(),
    });
  }
}

const afterCounts = Object.fromEntries(transportPatches.map((patch) => [patch.key, countPassengerChildren(patch.passengers)]));
console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  strictChildren: strictRows.length,
  matchedChildren: matches.length,
  reservationsDeleted: [...reservationsToDelete.values()].map(compactReservation),
  transportChildrenAfterPatch: afterCounts,
  reservationOverrides: matches
    .filter((item) => CHILD_TRANSPORT_OVERRIDES[item.strict.key])
    .map((item) => ({
      child: item.strict.label,
      reservationId: item.reservation.id,
      override: CHILD_TRANSPORT_OVERRIDES[item.strict.key],
    })),
  denzel: matches.filter((item) => item.strict.key === "denzel").map((item) => ({
    reservationId: item.reservation.id,
    reference: item.reservation.numeroDeReservation || "",
    status: item.reservation.status,
    aller: item.reservation.transport?.departureCity || "",
    retour: item.reservation.transport?.returnCity || "",
  })),
}, null, 2));

process.exit(0);

function buildExpectedPassengers(items) {
  const result = {
    allerNorth: [],
    allerSouth: [],
    allerBus: [],
    retourNorth: [],
    retourSouth: [],
    retourBus: [],
  };
  for (const item of items) {
    const reservation = item.reservation;
    const override = CHILD_TRANSPORT_OVERRIDES[item.strict.key] || {};
    const departureCity = normalizeCityLabel(override.departureCity || reservation.transport?.departureCity);
    const returnCity = normalizeCityLabel(reservation.transport?.returnCity);
    const passenger = {
      reservationId: reservation.id,
      pickupCity: "",
      nom: reservationChildrenLabel(reservation),
      childName: reservationChildrenLabel(reservation),
      sejourName: stayCodeFromName(reservation.sejour?.name || reservation.sejourName),
      children: (reservation.minor?.children || []).map((child) => ({
        firstName: clean(child.firstName),
        lastName: clean(child.lastName),
        birthDate: clean(child.birthDate),
        gender: clean(child.gender),
      })),
    };
    if (!isSurPlace(departureCity)) {
      const key = convoiKey(departureCity, "aller");
      if (key) result[key].push({ ...passenger, pickupCity: departureCity });
      result.allerBus.push({ ...passenger, pickupCity: passenger.sejourName === "EVCC" ? "Bidarray" : "Messanges" });
    }
    if (!isSurPlace(returnCity)) {
      const key = convoiKey(returnCity, "retour");
      if (key) result[key].push({ ...passenger, pickupCity: returnCity });
      result.retourBus.push({ ...passenger, pickupCity: passenger.sejourName === "EVCC" ? "Bidarray" : "Messanges" });
    }
  }
  return result;
}

function transportMetadataPatch(patch) {
  const ids = patch.passengers.map((passenger) => passenger.reservationId);
  const children = countPassengerChildren(patch.passengers);
  const cityCounts = countByPassengerCity(patch.passengers);
  const stayCounts = countByPassengerStay(patch.passengers);
  const next = {};
  if (patch.key === "allerNorth") {
    next.segments = (patch.transport?.segments || []).map((segment) => {
      if (segment.id === "s3-aller-lille-paris") {
        return {
          ...segment,
          passengerReservationIds: idsForCity(patch.passengers, "Lille"),
          sharedPickupChildren: cityCounts.lille || 0,
          instructions: "10 enfants montent à Lille Europe puis rejoignent le convoi Nord à Paris.",
        };
      }
      if (segment.id === "s3-aller-paris-bordeaux") {
        return {
          ...segment,
          passengerReservationIds: ids,
          sharedPickupChildren: children,
          instructions: "Les groupes Lille et Nantes rejoignent les enfants convoqués à Paris, puis tout le convoi Nord/Ouest prend le train Paris → Bordeaux.",
        };
      }
      return segment;
    });
    next.branches = (patch.transport?.branches || []).map((branch) =>
      branch.id === "s3-aller-nantes-paris"
        ? {
            ...branch,
            passengerReservationIds: idsForCity(patch.passengers, "Nantes"),
            sharedPickupChildren: cityCounts.nantes || 0,
            instructions: "4 enfants montent à Nantes puis rejoignent le convoi Nord à Paris Montparnasse.",
          }
        : branch,
    );
  }
  if (patch.key === "allerSouth") {
    next.branches = [];
    const lyonToulouseIds = idsForCities(patch.passengers, ["Lyon", "Valence", "Montpellier", "Béziers"]);
    next.segments = (patch.transport?.segments || []).map((segment) => {
      if (segment.id === "s3-aller-lyon-toulouse") {
        return {
          ...segment,
          passengerReservationIds: lyonToulouseIds,
          sharedPickupChildren: countPassengerChildren(patch.passengers.filter((passenger) => lyonToulouseIds.includes(passenger.reservationId))),
          instructions: "Mattéo récupère les enfants à Lyon, puis Valence, Montpellier Saint-Roch et Béziers avant de descendre à Toulouse.",
          stops: (segment.stops || []).map((stop) => ({
            ...stop,
            sharedPickupChildren: cityCounts[normalizeKey(stop.city)] || 0,
          })),
        };
      }
      if (segment.id === "s3-aller-toulouse-bordeaux") {
        return {
          ...segment,
          passengerReservationIds: ids,
          sharedPickupChildren: children,
          instructions: "À Toulouse, Mattéo récupère les enfants convoqués à Toulouse puis prend le Toulouse → Bordeaux avec tout le groupe Sud/Ouest.",
        };
      }
      return segment;
    });
  }
  if (patch.key === "allerBus") {
    next.segments = (patch.transport?.segments || []).map((segment) =>
      segment.id === "s3-bus-aller-bordeaux-bidarray"
        ? {
            ...segment,
            passengerReservationIds: ids,
            sharedChildrenCount: children,
            sharedCapacity: Number(segment.sharedCapacity || segment.capacity || 55),
            capacityShortage: Math.max(0, children - Number(segment.sharedCapacity || segment.capacity || 55)),
            instructions: `Autocar commun S3 aller : tout le monde monte à Bordeaux, ${stayCounts.MCSC || 0} enfants MCSC descendent à Messanges, ${stayCounts.EVCC || 0} enfants EVCC poursuivent vers Bidarray.`,
            stops: (segment.stops || []).map((stop) =>
              normalizeKey(stop.city) === "messanges"
                ? { ...stop, sharedDropoffChildren: stayCounts.MCSC || 0 }
                : stop,
            ),
          }
        : segment,
    );
  }
  return next;
}

function countByPassengerCity(passengers) {
  return passengers.reduce((result, passenger) => {
    const key = normalizeKey(passenger.pickupCity);
    result[key] = (result[key] || 0) + Math.max(passenger.children?.length || 0, 1);
    return result;
  }, {});
}

function countByPassengerStay(passengers) {
  return passengers.reduce((result, passenger) => {
    const key = passenger.sejourName || "?";
    result[key] = (result[key] || 0) + Math.max(passenger.children?.length || 0, 1);
    return result;
  }, {});
}

function idsForCity(passengers, city) {
  const key = normalizeKey(city);
  return passengers.filter((passenger) => normalizeKey(passenger.pickupCity) === key).map((passenger) => passenger.reservationId);
}

function idsForCities(passengers, cities) {
  const keys = new Set(cities.map(normalizeKey));
  return passengers.filter((passenger) => keys.has(normalizeKey(passenger.pickupCity))).map((passenger) => passenger.reservationId);
}

function convoiKey(city, direction) {
  const key = normalizeKey(city);
  if (NORTH_CITIES.has(key)) return `${direction}North`;
  if (SOUTH_CITIES.has(key)) return `${direction}South`;
  return null;
}

function childrenForReservations(items) {
  const result = [];
  for (const reservation of items) {
    for (const child of reservation.minor?.children || []) {
      result.push({
        reservation,
        child,
        key: nameKey(child.firstName, child.lastName),
        label: `${clean(child.firstName)} ${clean(child.lastName)}`.trim(),
      });
    }
  }
  return result;
}

function scoreReservationMatch(reservation) {
  let score = 0;
  if (isValidatedStatus(reservation.status)) score += 100;
  if (reservation.id.startsWith("ete26-")) score += 10;
  if (reservation.numeroDeReservation?.startsWith("ETE26")) score += 5;
  return score;
}

function dedupePassengers(passengers) {
  const grouped = new Map();
  for (const passenger of passengers) {
    const key = passenger.reservationId;
    if (!grouped.has(key)) {
      grouped.set(key, { ...passenger, children: [] });
    }
    const target = grouped.get(key);
    const existingChildren = target.children || [];
    for (const child of passenger.children || []) {
      if (!existingChildren.some((item) => nameKey(item.firstName, item.lastName) === nameKey(child.firstName, child.lastName))) {
        existingChildren.push(child);
      }
    }
    target.children = existingChildren;
    target.childName = reservationChildrenLabel({ minor: { children: existingChildren } }) || target.childName || target.nom || "";
    target.nom = target.childName;
  }
  return [...grouped.values()].sort((a, b) => a.childName.localeCompare(b.childName, "fr", { sensitivity: "base" }));
}

function countPassengerChildren(passengers) {
  return (passengers || []).reduce((sum, passenger) => sum + Math.max(passenger.children?.length || 0, 1), 0);
}

function compactReservation(reservation) {
  return {
    id: reservation.id,
    reference: reservation.numeroDeReservation || "",
    child: reservationChildrenLabel(reservation),
    status: reservation.status || "",
    stay: stayCodeFromName(reservation.sejour?.name || reservation.sejourName),
    aller: reservation.transport?.departureCity || "",
    retour: reservation.transport?.returnCity || "",
  };
}

function reservationChildrenLabel(reservation) {
  return (reservation.minor?.children || [])
    .map((child) => `${clean(child.firstName)} ${clean(child.lastName)}`.trim())
    .filter(Boolean)
    .join(", ");
}

function weekFromReservation(reservation) {
  return {
    "2026-07-06": "S1",
    "2026-07-20": "S2",
    "2026-08-03": "S3",
    "2026-08-17": "S4",
  }[String(reservation.sejour?.startDate || reservation.startDate || "").slice(0, 10)] || "";
}

function stayCodeFromName(value) {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (raw.includes("surf") || raw.includes("mcsc")) return "MCSC";
  if (raw.includes("eaux") || raw.includes("evcc") || raw.includes("creative-camp")) return "EVCC";
  return "";
}

function isDeletedStatus(value) {
  return /deleted|annul|cancel|passe/.test(normalizeKey(value));
}

function isValidatedStatus(value) {
  return normalizeKey(value) === "validated";
}

function isSurPlace(value) {
  return normalizeKey(value) === "surplace";
}

function normalizeCityLabel(value) {
  const key = normalizeKey(value);
  const cities = {
    paris: "Paris",
    lille: "Lille",
    lyon: "Lyon",
    marseille: "Marseille",
    montpellier: "Montpellier",
    bordeaux: "Bordeaux",
    toulouse: "Toulouse",
    nantes: "Nantes",
    valence: "Valence",
    beziers: "Béziers",
    bezier: "Béziers",
    surplace: "Sur Place",
  };
  return cities[key] || clean(value);
}

function nameKey(firstName, lastName) {
  const a = normalizeKey(`${firstName || ""} ${lastName || ""}`);
  const b = normalizeKey(`${lastName || ""} ${firstName || ""}`);
  return a < b ? a : b;
}

function normalizeKey(value) {
  return fixMojibake(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function clean(value) {
  return fixMojibake(String(value || "")).replace(/\s+/g, " ").trim();
}

function fixMojibake(value) {
  return String(value || "")
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ãª/g, "ê")
    .replace(/Ã«/g, "ë")
    .replace(/Ã /g, "à")
    .replace(/Ã¢/g, "â")
    .replace(/Ã¹/g, "ù")
    .replace(/Ã»/g, "û")
    .replace(/Ã®/g, "î")
    .replace(/Ã¯/g, "ï")
    .replace(/Ã´/g, "ô")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã§/g, "ç")
    .replace(/Ã‰/g, "É")
    .replace(/Ã‡/g, "Ç");
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
