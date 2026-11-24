import { db } from "@/src/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { normalizeEmail, verifyUnsubscribeToken } from "@/src/lib/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNSUB = "campagne_unsubscribes";

async function readParams(request) {
  const url = new URL(request.url);
  let email = url.searchParams.get("e");
  let token = url.searchParams.get("t");
  let oneClick = false;
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (form) {
      email = form.get("e") || email;
      token = form.get("t") || token;
      oneClick = form.get("List-Unsubscribe") === "One-Click";
    }
  }
  return { email: normalizeEmail(email), token: String(token || ""), oneClick };
}

// POST : bouton « Se désabonner » de la messagerie (un clic) ou formulaire de la page.
export async function POST(request) {
  const { email, token, oneClick } = await readParams(request);
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return oneClick
      ? new Response("Lien invalide", { status: 400 })
      : Response.redirect(new URL("/desinscription?erreur=1", request.url), 303);
  }

  await setDoc(doc(db, UNSUB, email), {
    email,
    reason: oneClick ? "Lien désinscription (messagerie)" : "Lien désinscription",
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  if (oneClick) return new Response("OK", { status: 200 });
  const done = new URL("/desinscription", request.url);
  done.searchParams.set("ok", "1");
  done.searchParams.set("e", email);
  return Response.redirect(done, 303);
}

// GET : jamais de désinscription directe (les antivirus ouvrent les liens),
// on renvoie vers la page de confirmation.
export async function GET(request) {
  const url = new URL(request.url);
  const page = new URL("/desinscription", request.url);
  url.searchParams.forEach((value, key) => page.searchParams.set(key, value));
  return Response.redirect(page, 303);
}
