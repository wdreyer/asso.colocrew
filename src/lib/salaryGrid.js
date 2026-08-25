// Grille salariale ColoCrew — base de calcul des contrats (net/brut par poste + primes).
// Une ligne de la grille = un poste (12 jours de référence). Une ligne à part (isPrime)
// porte le montant de la prime d'ancienneté, ajoutée par unité au contrat.

import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

export const REFERENCE_DAYS = 12;
export const PAID_LEAVE_RATE = 0.10;

export const DEFAULT_SALARY_GRID = [
  { id: "benevole",        label: "Benevole",             perDay: 0,  perStayNet: 0,    perStayGross: 0,    order: 0, isPrime: false },
  { id: "stagiaire",       label: "Stagiaire/SS Diplôme", perDay: 50, perStayNet: 600,  perStayGross: 810,  order: 1, isPrime: false },
  { id: "bafa",            label: "BAFA",                 perDay: 55, perStayNet: 660,  perStayGross: 891,  order: 2, isPrime: false },
  { id: "as-sb",           label: "AS/SB",                perDay: 60, perStayNet: 720,  perStayGross: 972,  order: 3, isPrime: false },
  { id: "dsa",             label: "DSA",                  perDay: 70, perStayNet: 840,  perStayGross: 1134, order: 4, isPrime: false },
  { id: "ds",              label: "DS",                   perDay: 90, perStayNet: 1080, perStayGross: 1458, order: 5, isPrime: false },
  { id: "prime-anciennete", label: "Prime d'ancienneté (par séjour)", perDay: 5, perStayNet: 60, perStayGross: 81, order: 6, isPrime: true },
];

export async function ensureSalaryGridSeeded(db) {
  const snap = await getDocs(collection(db, COLLECTIONS.SALARY_GRID));
  const existingIds = new Set(snap.docs.map((item) => item.id));
  if (!snap.empty && DEFAULT_SALARY_GRID.every((row) => existingIds.has(row.id))) return false;
  const batch = writeBatch(db);
  DEFAULT_SALARY_GRID.filter((row) => !existingIds.has(row.id)).forEach((row) => {
    const { id, ...data } = row;
    batch.set(doc(db, COLLECTIONS.SALARY_GRID, id), data);
  });
  await batch.commit();
  return true;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function splitPaidLeaveIncluded(total, rate = PAID_LEAVE_RATE) {
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { salary: 0, paidLeave: 0, total: 0, rate };
  }
  const salary = round2(amount / (1 + rate));
  return {
    salary,
    paidLeave: round2(amount - salary),
    total: round2(amount),
    rate,
  };
}

// gridRow / primeUnit : lignes { perStayNet, perStayGross } issues de salary_grid.
export function computeSalary({ gridRow, primeUnit, primeCount = 0, convoyagePrime = false, nbDays = REFERENCE_DAYS }) {
  const ratio = nbDays > 0 ? nbDays / REFERENCE_DAYS : 1;
  const baseNet   = gridRow ? gridRow.perStayNet   * ratio : 0;
  const baseGross = gridRow ? gridRow.perStayGross * ratio : 0;
  const primeNet   = primeUnit ? primeUnit.perStayNet   * (Number(primeCount) || 0) : 0;
  const primeGross = primeUnit ? primeUnit.perStayGross * (Number(primeCount) || 0) : 0;
  const convoyageNet = convoyagePrime && gridRow ? (Number(gridRow.perDay) || gridRow.perStayNet / REFERENCE_DAYS || 0) : 0;
  const convoyageGross = convoyagePrime && gridRow ? (gridRow.perStayGross / REFERENCE_DAYS || 0) : 0;
  const net = round2(baseNet + primeNet + convoyageNet);
  const gross = round2(baseGross + primeGross + convoyageGross);
  return {
    net,
    gross,
    netSocial: splitPaidLeaveIncluded(net),
    grossSocial: splitPaidLeaveIncluded(gross),
  };
}
