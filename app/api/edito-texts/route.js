import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";

export const dynamic = "force-dynamic";
function documentUrl() {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!project) throw new Error("Configuration Firebase absente.");
  return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(project) + "/databases/(default)/documents/pages/edito2026-inline";
}
export async function GET(request) {
  try {
    const admin = request.headers.has("authorization") ? await requireFirebaseAdmin(request) : null;
    const response = await fetch(documentUrl(), { cache: "no-store" });
    if (response.status === 404) return Response.json({ texts: {}, admin: Boolean(admin) });
    if (!response.ok) throw new Error("Chargement des textes impossible.");
    const data = await response.json();
    const fields = data.fields?.texts?.mapValue?.fields || {};
    const texts = Object.fromEntries(Object.entries(fields).filter(([key,v]) => /^[a-f0-9]{16}$/.test(key) && typeof v.stringValue === "string").map(([key,v]) => [key,v.stringValue]));
    return Response.json({ texts, admin: Boolean(admin) });
  } catch (error) { return adminErrorResponse(error); }
}
export async function PUT(request) {
  try {
    await requireFirebaseAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body || !/^[a-f0-9]{16}$/.test(body.key) || typeof body.text !== "string" || !body.text.trim() || body.text.length > 8000) {
      return Response.json({ error: "Texte invalide (1 à 8 000 caractères)." }, { status: 400 });
    }
    // A field mask preserves other texts, including concurrent edits to another field.
    const response = await fetch(documentUrl() + "?updateMask.fieldPaths=" + encodeURIComponent("texts.`" + body.key + "`"), {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: request.headers.get("authorization") },
      body: JSON.stringify({ fields: { texts: { mapValue: { fields: { [body.key]: { stringValue: body.text.trim() } } } } } }),
      cache: "no-store",
    });
    if (!response.ok) throw Object.assign(new Error("Enregistrement refusé ou indisponible."), { status: response.status === 403 ? 403 : 502 });
    return Response.json({ ok: true, text: body.text.trim() });
  } catch (error) { return adminErrorResponse(error); }
}
