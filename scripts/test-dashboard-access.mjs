import assert from "node:assert/strict";
import { initializeApp as clientApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { connectStorageEmulator, getStorage, ref, uploadBytes } from "firebase/storage";
import { initializeApp as serverApp } from "firebase-admin/app";
import { getAuth as serverAuth } from "firebase-admin/auth";
import { getFirestore as serverDb } from "firebase-admin/firestore";
import { effectiveDashboardSections, canOpenDashboardPath } from "../src/lib/dashboardAccess.js";

const projectId = process.env.GCLOUD_PROJECT;
if (!projectId?.startsWith("demo-") || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error("Ce test exige les émulateurs Auth, Firestore et Storage d’un projet de démonstration.");
}
const app = serverApp({ projectId, storageBucket: projectId + ".appspot.com" });
const db = serverDb(app);
const auth = serverAuth(app);
const crew = { uid: "crew", email: "crew@example.test", password: "password-demo-123" };
const existing = { uid: "admin", email: "admin@example.test", password: "password-demo-123" };
const empty = { uid: "staff", email: "staff@example.test", password: "password-demo-123" };

for (const member of [crew, existing, empty]) await auth.createUser(member);
await db.collection("admins").doc(existing.uid).set({ active: true });
await db.collection("staff_accounts").doc(crew.uid).set({ uid: crew.uid, email: crew.email, status: "approved", memberId: "crew-member", dashboardSections: ["reservations"] });
await db.collection("reservations").doc("booking").set({ status: "pending", payment: { priceStatus: "estimated" } });
await db.collection("staff_contracts").doc("private").set({ memberId: "different" });
await db.collection("campagne_runs").doc("private").set({ status: "done" });

const apps = [];
async function client(name, user) {
  const candidate = clientApp({ projectId, apiKey: "fake-api-key", storageBucket: projectId + ".appspot.com" }, name);
  apps.push(candidate);
  const firestore = getFirestore(candidate);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  connectFirestoreEmulator(firestore, host, Number(port));
  if (user) {
    const clientAuth = getAuth(candidate);
    connectAuthEmulator(clientAuth, "http://" + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
    await signInWithEmailAndPassword(clientAuth, user.email, user.password);
  }
  const storage = getStorage(candidate);
  const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
  connectStorageEmulator(storage, storageHost, Number(storagePort));
  return [firestore, storage];
}

const deny = (request) => assert.rejects(request, (error) => ["permission-denied", "storage/unauthorized"].includes(error.code));
try {
  const [anon] = await client("anon");
  const [operator, operatorStorage] = await client("operator", crew);
  const [admin, adminStorage] = await client("admin", existing);
  const [newStaff] = await client("new-staff", empty);
  assert.deepEqual(effectiveDashboardSections({ status: "approved", memberId: "crew-member", dashboardSections: ["reservations", "reservations", "unknown"] }), ["reservations"]);
  assert.equal(canOpenDashboardPath("/dashboard/reservations/booking", false, ["reservations"]), true);
  assert.equal(canOpenDashboardPath("/dashboard/acces", false, ["reservations"]), false);
  assert.equal(canOpenDashboardPath("/dashboard/rh/comptes", false, ["hr"]), false);
  assert.equal(canOpenDashboardPath("/dashboard/rh/deroules", false, ["dayPlans"]), true);
  assert.equal(canOpenDashboardPath("/dashboard/rh/contrats", false, ["hr"]), true);
  assert.equal(canOpenDashboardPath("/dashboard/rh/acces", false, ["hr"]), false);
  assert.equal(canOpenDashboardPath("/dashboard/rh", false, ["dayPlans"]), false);
  assert.equal(canOpenDashboardPath("/dashboard/acces", true, []), true);
  assert.equal(canOpenDashboardPath("/dashboard/rh/equipe/crew-member", false, ["hr"]), true);
  assert.equal(canOpenDashboardPath("/dashboard/rh/equipe/crew-member", false, ["dayPlans"]), false);

  const booking = doc(operator, "reservations", "booking");
  assert.equal((await getDocs(collection(operator, "reservations"))).size, 1);
  assert.equal((await getDocs(collection(admin, "admins"))).size, 1);
  await deny(getDocs(collection(operator, "admins")));
  await deny(getDocs(collection(anon, "admins")));
  await deny(getDocs(collection(anon, "reservations")));
  await deny(getDoc(doc(anon, "reservations", "booking")));
  await deny(getDocs(collection(operator, "staff_contracts")));
  await deny(getDocs(collection(operator, "campagne_runs")));

  const requests = { uid: empty.uid, email: empty.email, status: "pending", memberId: "" };
  await deny(setDoc(doc(newStaff, "staff_accounts", empty.uid), { ...requests, dashboardSections: ["reservations"] }));
  await setDoc(doc(newStaff, "staff_accounts", empty.uid), requests);
  await deny(updateDoc(doc(newStaff, "staff_accounts", empty.uid), { status: "approved", memberId: "someone-else" }));
  await deny(updateDoc(doc(operator, "staff_accounts", crew.uid), { dashboardSections: ["hr"] }));

  const event = { type: "call", summary: "Famille jointe", actorUid: crew.uid, actorEmail: crew.email, createdAt: serverTimestamp() };
  const activity = doc(operator, "reservations", "booking", "activity", "call");
  await setDoc(activity, event);
  await deny(setDoc(doc(operator, "reservations/booking/activity/fake-author"), { ...event, actorUid: existing.uid }));
  await deny(setDoc(doc(operator, "reservations/booking/activity/fake-mail"), { ...event, type: "email" }));
  await deny(updateDoc(activity, { summary: "Histoire modifiée" }));
  const batch = writeBatch(operator);
  batch.update(booking, { "payment.priceStatus": "validated", "payment.validatedPrice": 315, status: "validated" });
  batch.set(doc(operator, "reservations/booking/activity/closed"), { ...event, type: "status", summary: "Inscription validée" });
  await batch.commit();
  assert.equal((await getDoc(booking)).data().status, "validated");
  await deny(setDoc(doc(operator, "reservations/booking/activity/late"), event));
  await deny(getDoc(doc(anon, "reservations/booking/activity/call")));

  const testFile = new Uint8Array([1, 2, 3]);
  const metadata = { contentType: "application/pdf" };
  await deny(uploadBytes(ref(operatorStorage, "staff-contracts/crew-member/private.pdf"), testFile, metadata));
  await uploadBytes(ref(adminStorage, "staff-contracts/crew-member/private.pdf"), testFile, metadata);
  await updateDoc(doc(admin, "staff_accounts", empty.uid), { status: "approved", memberId: "media-member", dashboardSections: ["media"] });
  const [, mediaStorage] = await client("media", empty);
  await uploadBytes(ref(mediaStorage, "medias/album/test.jpg"), testFile, { contentType: "image/jpeg" });
  await deny(uploadBytes(ref(mediaStorage, "transports/convoy/billets/test.pdf"), testFile, metadata));

  await updateDoc(doc(admin, "staff_accounts", crew.uid), { dashboardSections: [] });
  await deny(getDocs(collection(operator, "reservations")));
  await deny(getDocs(collection(operator, "reservations/booking/activity")));
  console.log("OK droits de sections, élévation refusée, journal et Storage, révocation");
} finally {
  await Promise.all(apps.map((candidate) => deleteApp(candidate)));
}
