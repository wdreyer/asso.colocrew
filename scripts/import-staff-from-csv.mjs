// import-staff-from-csv.mjs
// Importe / met à jour les fiches animateurs depuis les réponses de formulaire CSV.
//
// Dry-run par défaut — affiche ce qui serait créé/mis à jour.
// node scripts/import-staff-from-csv.mjs          → dry-run
// node scripts/import-staff-from-csv.mjs --apply  → applique en Firestore

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyCVbBi8zfCo_hTGMuqAOjoUt5Bu5_Ssvbo",
  projectId:         "colocrew-5edf9",
  authDomain:        "colocrew-5edf9.firebaseapp.com",
  storageBucket:     "colocrew-5edf9.appspot.com",
  messagingSenderId: "74332244617",
  appId:             "1:74332244617:web:1947fe469b0ca4a103d458",
};

// IDs Firestore connus pour des membres dont le nom/email diffère légèrement
const ID_OVERRIDES = {
  "lecleachlolita@gmail.com": "lolita-nom-a-completer",
  "nbelayane@gmail.com":      "noam-belayane",
};

// ── Données extraites du formulaire "Dispos W-E prépa ColoCrew" ──────────────
const ANIMATEURS = [
  {
    firstName: "Elisa", lastName: "Cordier",
    email: "elisa3cordier@gmail.com", phone: "0783808944",
    dateOfBirth: "14/06/2008", birthPlace: "Dakar (Sénégal)",
    socialSecurityNumber: "208069934104443",
    address: "Pau",
    staffType: "animateur",
  },
  {
    firstName: "Axel", lastName: "Raharinosy",
    email: "axelraharinosy@icloud.com", phone: "0769976501",
    dateOfBirth: "06/10/2009", birthPlace: "Paris 12e",
    socialSecurityNumber: "1 09 10 75 112 702 81",
    address: "Villecresnes (94)",
    staffType: "animateur",
  },
  {
    firstName: "Lisa", lastName: "Manka",
    email: "lisamanka3@gmail.com", phone: "0618591058",
    dateOfBirth: "01/05/1996", birthPlace: "Saint-Omer",
    socialSecurityNumber: "2 96 05 62 765 244 90",
    address: "Toulouse",
    staffType: "animateur",
  },
  // Aïcha Bellouche — exclue de l'import (non retenue dans l'équipe)
  {
    firstName: "Sam", lastName: "Eyraud",
    email: "eyraud.08@icloud.com", phone: "0786780191",
    dateOfBirth: "29/01/2008", birthPlace: "",
    socialSecurityNumber: "108013324335163",
    address: "9 place Jean Moulin, Libourne",
    staffType: "animateur",
  },
  {
    firstName: "Lilou", lastName: "Joyeux",
    email: "lilou joyeux.pro@gmail.com", phone: "0613126812",
    dateOfBirth: "07/05/2008", birthPlace: "Toulouse",
    socialSecurityNumber: "208053155557061",
    address: "Toulouse",
    staffType: "animateur",
  },
  {
    firstName: "Elisa", lastName: "Péau",
    email: "Elisa.peau@gmail.com", phone: "0749161843",
    dateOfBirth: "09/04/1996", birthPlace: "Saint-Nazaire",
    socialSecurityNumber: "2 96 04 44 184 368",
    address: "Bordeaux / Marseille",
    staffType: "animateur",
  },
  {
    firstName: "Lila", lastName: "Saddoune",
    email: "l.saddoune@gmail.com", phone: "0687942238",
    dateOfBirth: "07/02/1999", birthPlace: "Les Lilas",
    socialSecurityNumber: "2 99 02 93 045 036 11",
    address: "Paris",
    staffType: "animateur",
  },
  {
    firstName: "Shirley", lastName: "Siousarram Annerose",
    email: "Siousarrams@gmail.com", phone: "0614984861",
    dateOfBirth: "05/04/2002", birthPlace: "Le Blanc-Mesnil",
    socialSecurityNumber: "202049300703817",
    address: "Sucy-en-Brie (94370)",
    staffType: "animateur",
  },
  {
    firstName: "Lea", lastName: "Chaptal",
    email: "lea.chaptal@hotmail.fr", phone: "0650520481",
    dateOfBirth: "02/05/1996", birthPlace: "Aix-les-Bains",
    socialSecurityNumber: "296057300802821",
    address: "Paris",
    staffType: "animateur",
  },
  {
    firstName: "Tessa", lastName: "Ramette",
    email: "tessaramette@gmail.com", phone: "0637100415",
    dateOfBirth: "11/04/2009", birthPlace: "",
    socialSecurityNumber: "209049200209684",
    address: "Antony (92)",
    staffType: "animateur",
  },
  {
    firstName: "Maristella", lastName: "De Vico",
    email: "maristella.dv@gmail.com", phone: "+39 3271667924",
    dateOfBirth: "23/02/1997", birthPlace: "Turin (Italie)",
    socialSecurityNumber: "DVCMST97B63L219Z",
    address: "Turin, Italie",
    staffType: "animateur",
  },
  {
    firstName: "Louis", lastName: "Richard",
    email: "louis.richard.coste@gmail.com", phone: "0633422251",
    dateOfBirth: "12/04/2006", birthPlace: "Pontarlier",
    socialSecurityNumber: "1 06 04 25 462 261",
    address: "Rennes (puis Remoray, Franche-Comté)",
    staffType: "animateur",
  },
  {
    firstName: "Sofian", lastName: "Rhourbaly",
    email: "srhourbaly@icloud.com", phone: "0766503666",
    dateOfBirth: "05/12/2004", birthPlace: "Villeneuve-Saint-Georges",
    socialSecurityNumber: "104129407803577",
    address: "",
    staffType: "animateur",
  },
  {
    firstName: "Noham", lastName: "Belayane",
    email: "nbelayane@gmail.com", phone: "0749011093",
    dateOfBirth: "20/04/2009", birthPlace: "Meaux",
    socialSecurityNumber: "109047728437347",
    address: "Paris",
    staffType: "animateur",
  },
  {
    firstName: "Lolita", lastName: "Le Cleach",
    email: "lecleachlolita@gmail.com", phone: "0662920753",
    dateOfBirth: "15/07/2004", birthPlace: "Quimper",
    socialSecurityNumber: "204072923236847",
    address: "Penmarch",
    staffType: "animateur",
  },
];

// ── Données extraites du formulaire "Ma direction" ────────────────────────────
const DIRECTION = [
  {
    firstName: "Lorette", lastName: "Kuc",
    email: "kuclorette@gmail.com", phone: "0617077742",
    dateOfBirth: "16/02/1998", birthPlace: "Valence",
    socialSecurityNumber: "",
    address: "",
    staffType: "directeur",
  },
  {
    firstName: "Lamia", lastName: "Fadl",
    email: "mhflamia23@gmail.com", phone: "0695972898",
    dateOfBirth: "23/01/2002", birthPlace: "",
    socialSecurityNumber: "202019201914811",
    address: "Bezons (Île-de-France)",
    staffType: "directeur",
  },
  {
    firstName: "Anthony", lastName: "Dagois",
    email: "dagois.anthony.l@orange.fr", phone: "+33785902970",
    dateOfBirth: "25/03/2004", birthPlace: "Créteil (94000)",
    socialSecurityNumber: "104039402815750",
    address: "2 impasse de l'Alma, 94210 Saint-Maur-des-Fossés",
    staffType: "directeur",
  },
  {
    firstName: "Elorri", lastName: "Corbin",
    email: "corbin.elorri@gmail.com", phone: "0786859904",
    dateOfBirth: "30/09/1998", birthPlace: "Foix",
    socialSecurityNumber: "2980909122087",
    address: "30 impasse Pons, 31400 Toulouse",
    staffType: "directeur",
  },
  {
    firstName: "Anaïs", lastName: "Zaepffel",
    email: "anais.zaepffel.pro@gmail.com", phone: "0787192121",
    dateOfBirth: "05/01/1997", birthPlace: "Sélestat (67)",
    socialSecurityNumber: "297016745223319",
    address: "Massy (91300)",
    staffType: "directeur",
  },
  {
    firstName: "Axelle", lastName: "Mousset",
    email: "moaxelle@gmail.com", phone: "0638294755",
    dateOfBirth: "14/06/2004", birthPlace: "Niort",
    socialSecurityNumber: "204067919133937",
    address: "Romans (79)",
    staffType: "directeur",
  },
  {
    firstName: "Romane", lastName: "Kerveillant",
    email: "romanekerveillant@gmail.com", phone: "0617935359",
    dateOfBirth: "02/12/2003", birthPlace: "Quimper",
    socialSecurityNumber: "203122923225892",
    address: "",
    staffType: "directeur",
  },
];

// Seules les personnes présentes dans les affectations RH 2026 sont importées.
// Lisa Manka et Aïcha Bellouche ne font pas partie de cette équipe validée.
const EXCLUDED_EMAILS = new Set([
  "lisamanka3@gmail.com",
]);
const ALL_STAFF = [...ANIMATEURS, ...DIRECTION]
  .filter((member) => !EXCLUDED_EMAILS.has(member.email.toLowerCase()));

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function matchMember(candidate, existing) {
  // Override explicite par email → ID Firestore connu
  const normEmail = norm(candidate.email);
  if (normEmail && ID_OVERRIDES[candidate.email]) {
    const byId = existing.find((m) => m.id === ID_OVERRIDES[candidate.email]);
    if (byId) return byId;
  }
  // Match par email normalisé
  if (normEmail) {
    const byEmail = existing.find((m) => norm(m.email) === normEmail);
    if (byEmail) return byEmail;
  }
  // Match par prénom + nom
  const normFirst = norm(candidate.firstName);
  const normLast  = norm(candidate.lastName);
  return existing.find(
    (m) => norm(m.firstName) === normFirst && norm(m.lastName) === normLast
  ) || null;
}

async function main() {
  const DRY_RUN = !process.argv.includes("--apply");
  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN — aucune écriture. Ajoute --apply pour appliquer.\n");
  } else {
    console.log("\n🚀  APPLY MODE — écriture Firestore activée.\n");
  }

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  console.log("⏳  Lecture Firestore staff_members...");
  const snap = await getDocs(collection(db, "staff_members"));
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`✅  ${existing.length} membre(s) existant(s) dans Firestore\n`);

  const toCreate = [];
  const toUpdate = [];

  for (const candidate of ALL_STAFF) {
    const match = matchMember(candidate, existing);
    if (match) {
      const diffs = {};
      for (const field of ["firstName", "lastName", "email", "phone", "dateOfBirth", "birthPlace", "socialSecurityNumber", "address", "staffType"]) {
        const newVal = candidate[field];
        if (newVal && !match[field]) diffs[field] = newVal;
      }
      if ((diffs.firstName || diffs.lastName) && match.name) {
        diffs.name = `${diffs.firstName || match.firstName || ""} ${diffs.lastName || match.lastName || ""}`.trim();
      }
      if (Object.keys(diffs).length > 0) {
        toUpdate.push({ id: match.id, name: `${match.firstName || ""} ${match.lastName || ""}`.trim(), diffs });
      } else {
        console.log(`  ✔  ${candidate.firstName} ${candidate.lastName} — déjà à jour`);
      }
    } else {
      toCreate.push({
        firstName: candidate.firstName,
        lastName:  candidate.lastName,
        name:      `${candidate.firstName} ${candidate.lastName}`,
        email:     candidate.email,
        phone:     candidate.phone,
        dateOfBirth: candidate.dateOfBirth,
        birthPlace:  candidate.birthPlace,
        socialSecurityNumber: candidate.socialSecurityNumber,
        address:   candidate.address,
        staffType: candidate.staffType,
        active:    true,
      });
    }
  }

  console.log(`\n══════════════════════════════════════════════`);

  if (toCreate.length) {
    console.log(`\n🆕  À CRÉER (${toCreate.length}) :`);
    for (const m of toCreate) {
      console.log(`   ${m.name.padEnd(30)} [${m.staffType}]  ${m.email}`);
    }
  }

  if (toUpdate.length) {
    console.log(`\n✏️  À METTRE À JOUR (${toUpdate.length}) :`);
    for (const m of toUpdate) {
      console.log(`\n   ${m.name} (id: ${m.id})`);
      for (const [field, val] of Object.entries(m.diffs)) {
        console.log(`      + ${field}: "${val}"`);
      }
    }
  }

  if (!toCreate.length && !toUpdate.length) {
    console.log("\n✅  Tout est déjà à jour — rien à faire.");
    process.exit(0);
  }

  console.log(`\n══════════════════════════════════════════════`);

  if (DRY_RUN) {
    console.log("\n▶  Relance avec --apply pour écrire ces changements.\n");
    process.exit(0);
  }

  // ── Écriture ────────────────────────────────────────────────────────────────
  let createdCount = 0;
  let updatedCount = 0;

  for (const m of toCreate) {
    await addDoc(collection(db, "staff_members"), m);
    console.log(`  ✅  Créé : ${m.name}`);
    createdCount++;
  }

  for (const m of toUpdate) {
    await setDoc(doc(db, "staff_members", m.id), m.diffs, { merge: true });
    console.log(`  ✅  MàJ  : ${m.name}`);
    updatedCount++;
  }

  console.log(`\n🎉  Terminé — ${createdCount} créés, ${updatedCount} mis à jour.\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
