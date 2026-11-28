import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function serverApp() {
  const name = "colocrew-server";
  const existing = getApps().find((app) => app.name === name);
  if (existing) return existing;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
    credential: credentials ? cert(JSON.parse(credentials)) : applicationDefault(),
  }, name);
}

export function adminDb() {
  return getFirestore(serverApp());
}

export function adminAuth() {
  return getAuth(serverApp());
}

export function adminBucket() {
  return getStorage(serverApp()).bucket();
}
