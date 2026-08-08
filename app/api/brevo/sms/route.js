export const runtime = "nodejs";

const BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/sms";
const BREVO_KEY_ENV_NAMES = ["BREVO_API_KEY", "SENDINBLUE_API_KEY", "SIB_API_KEY"];

function cleanText(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function normalizeRecipient(value) {
  const raw = cleanText(value, 32).replace(/[^\d+]/g, "");
  if (/^\+33[67]\d{8}$/.test(raw)) return raw;
  if (/^0033[67]\d{8}$/.test(raw)) return `+${raw.slice(2)}`;
  if (/^0[67]\d{8}$/.test(raw)) return `+33${raw.slice(1)}`;
  if (/^33[67]\d{8}$/.test(raw)) return `+${raw}`;
  return "";
}

function getBrevoApiKey() {
  for (const name of BREVO_KEY_ENV_NAMES) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

export async function POST(request) {
  try {
    const apiKey = getBrevoApiKey();
    if (!apiKey) {
      return Response.json({
        error: "Cle API Brevo manquante. Ajoutez BREVO_API_KEY dans les variables d'environnement du site (cle API v3, pas le mot de passe SMTP).",
        missingEnv: BREVO_KEY_ENV_NAMES,
      }, { status: 500 });
    }

    const body = await request.json();
    const sender = cleanText(body.sender, 16);
    const recipient = normalizeRecipient(body.recipient);
    const content = cleanText(body.content, 1000);
    const tag = cleanText(body.tag, 120);

    if (!sender || !recipient || !content) {
      return Response.json({ error: "Parametres manquants ou invalides (sender, recipient, content)" }, { status: 400 });
    }

    const brevoRes = await fetch(BREVO_SMS_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        recipient,
        content,
        type: "transactional",
        ...(tag ? { tag } : {}),
      }),
    });

    const data = await brevoRes.json().catch(() => ({}));
    if (!brevoRes.ok) {
      return Response.json({
        error: data.message || data.error || `Erreur Brevo SMS HTTP ${brevoRes.status}`,
        details: data,
      }, { status: brevoRes.status });
    }

    return Response.json({ success: true, ...data });
  } catch (error) {
    console.error("[brevo/sms] Erreur envoi SMS:", error);
    return Response.json({ error: error.message || "Erreur envoi SMS" }, { status: 500 });
  }
}
