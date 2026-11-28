import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { effectiveDashboardSections } from "@/src/lib/dashboardAccess";
import { adminAuth, adminDb } from "@/src/lib/serverFirebase";

function accessError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function requireFirebaseUser(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw accessError("Connexion au dashboard requise.", 401);

  const auth = adminAuth();
  try {
    return await auth.verifyIdToken(token);
  } catch (error) {
    if (error.code === "app/invalid-credential" || error.code === "app/network-error") throw error;
    throw accessError("Session Firebase invalide ou expirée.", 401);
  }
}

export async function requireDashboardSection(request, allowed = []) {
  const user = await requireFirebaseUser(request);
  const db = adminDb();
  const [admin, account] = await Promise.all([
    db.collection(COLLECTIONS.ADMINS).doc(user.uid).get(),
    db.collection(COLLECTIONS.STAFF_ACCOUNTS).doc(user.uid).get(),
  ]);
  const staff = account.data();
  const sections = effectiveDashboardSections(staff);
  if (!admin.exists && !allowed.some((section) => sections.includes(section))) {
    throw accessError("Votre compte ne dispose pas de cet accès.", 403);
  }
  const name = [staff?.firstName, staff?.lastName].filter(Boolean).join(" ");
  return { uid: user.uid, email: user.email || "", name, isAdmin: admin.exists, sections };
}

export function requireFirebaseAdmin(request) {
  return requireDashboardSection(request);
}

export function adminErrorResponse(error) {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error("Erreur du service dashboard", error);
  return Response.json({ ok: false, error: status >= 500 ? "Le service est indisponible." : error.message }, { status });
}

export function withDashboardAccess(sections, handler) {
  return async (request, context) => {
    let actor;
    try {
      actor = await requireDashboardSection(request, sections);
    } catch (error) {
      return adminErrorResponse(error);
    }
    return handler(request, context, actor);
  };
}
