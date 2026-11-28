import { auth } from "@/src/lib/firebase";

export async function dashboardFetch(url, options = {}) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Connectez-vous au dashboard.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + await user.getIdToken());
  return fetch(url, { ...options, headers });
}
