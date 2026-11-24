import crypto from "crypto";

// Liens de désinscription signés pour les campagnes.
// Le jeton est un HMAC de l'adresse : impossible de désinscrire une adresse
// sans avoir reçu le mail. Clé : UNSUBSCRIBE_SECRET, sinon une clé dérivée
// du mot de passe SMTP (déjà présent côté serveur).

export const SITE_URL = "https://www.colocrew.com";
const PLACEHOLDER = /\{+\s*unsubscribe\s*\}+/gi;

function secret() {
  const base = process.env.UNSUBSCRIBE_SECRET
    || `colocrew-unsub:${process.env.NEXT_USER_PASSWORD || ""}`;
  return crypto.createHash("sha256").update(base).digest();
}

export function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

export function unsubscribeToken(email) {
  return crypto
    .createHmac("sha256", secret())
    .update(normalizeEmail(email))
    .digest("base64url")
    .slice(0, 24);
}

export function verifyUnsubscribeToken(email, token) {
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(String(token || ""));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function query(email) {
  const e = normalizeEmail(email);
  return `e=${encodeURIComponent(e)}&t=${unsubscribeToken(e)}`;
}

// Page vue par la personne (bouton de confirmation).
export function unsubscribeUrl(email) {
  return `${SITE_URL}/desinscription?${query(email)}`;
}

// Point d'entrée « un clic » (RFC 8058) utilisé par Gmail, Yahoo, Apple Mail…
export function oneClickUrl(email) {
  return `${SITE_URL}/api/desinscription?${query(email)}`;
}

export function unsubscribeHeaders(email) {
  return {
    "List-Unsubscribe": `<${oneClickUrl(email)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

const FOOTER_STYLE = "margin:16px auto 0;max-width:600px;padding:0 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#8a8296;text-align:center";

// Remplace {{unsubscribe}} par le lien personnel. Si le modèle n'a pas de
// lien de désinscription, en ajoute un en bas du mail.
export function withUnsubscribeLink(html, email) {
  const url = unsubscribeUrl(email);
  const source = String(html || "");
  if (PLACEHOLDER.test(source)) {
    PLACEHOLDER.lastIndex = 0;
    return source.replace(PLACEHOLDER, url);
  }
  const footer = `<p style="${FOOTER_STYLE}">Vous ne souhaitez plus recevoir nos informations ? <a href="${url}" style="color:#8a8296;text-decoration:underline">Se désinscrire</a></p>`;
  return /<\/body>/i.test(source)
    ? source.replace(/<\/body>/i, `${footer}</body>`)
    : `${source}${footer}`;
}
