export async function GET(request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const message = error
    ? `Connexion DocuSign refusée : ${error}`
    : "Connexion DocuSign autorisée. Vous pouvez fermer cette fenêtre et revenir dans le dashboard RH.";
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>DocuSign</title><body style="font-family:Arial;padding:40px"><h1>${error ? "Erreur" : "DocuSign connecté"}</h1><p>${message}</p></body></html>`, {
    status: error ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
