const firebaseApiKey = () =>
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "";

const firebaseProjectId = () =>
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";

export async function requireFirebaseAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const apiKey = firebaseApiKey();
  const projectId = firebaseProjectId();

  if (!idToken || !apiKey || !projectId) {
    throw Object.assign(new Error("Authentification administrateur requise."), { status: 401 });
  }

  const accountResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    },
  );
  const accountPayload = await accountResponse.json().catch(() => ({}));
  const uid = accountPayload?.users?.[0]?.localId;
  if (!accountResponse.ok || !uid) {
    throw Object.assign(new Error("Session Firebase invalide ou expirée."), { status: 401 });
  }

  const adminResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/admins/${encodeURIComponent(uid)}`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    },
  );

  if (!adminResponse.ok) {
    throw Object.assign(new Error("Accès administrateur refusé."), { status: 403 });
  }

  return { uid, email: accountPayload.users[0].email || "" };
}

export function adminErrorResponse(error) {
  return Response.json(
    { ok: false, error: error?.message || "Accès refusé." },
    { status: Number(error?.status) || 500 },
  );
}
