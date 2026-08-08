export const runtime = "nodejs";

const BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/sms";

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

export async function POST(request) {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "BREVO_API_KEY manquant" }, { status: 500 });
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
