import OpenAI from "openai";

const PROMPT = `Tu es un assistant qui extrait les informations d'un billet de transport (train, bus, avion…).
Lis attentivement le document et retourne UNIQUEMENT un objet JSON valide avec ces champs (null si absent) :
{
  "name": "nom/numéro du train ou du billet (ex: TGV 8421, Ouigo 7312, INOUI 6201)",
  "seats": nombre entier de places sur ce billet,
  "price": prix total en euros (nombre décimal, sans symbole),
  "departureTime": "heure de départ au format HH:MM",
  "arrivalTime": "heure d'arrivée au format HH:MM",
  "bookingReference": "code de réservation ou numéro de dossier",
  "from": "ville de départ",
  "to": "ville d'arrivée"
}
Ne retourne rien d'autre que ce JSON.`;

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function extractFromText(text) {
  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 512,
    messages: [{ role: "user", content: `${PROMPT}\n\nContenu du billet :\n${text}` }],
  });
  return response.choices[0].message.content;
}

async function extractFromImage(base64, mediaType) {
  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: "text", text: PROMPT },
      ],
    }],
  });
  return response.choices[0].message.content;
}

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY manquante dans .env.local" }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return Response.json({ error: "Fichier manquant" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mediaType = file.type || "application/pdf";
    const isPdf = mediaType === "application/pdf";

    let raw;
    if (isPdf) {
      // Extract text from PDF, then send as text to GPT
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const parsed = await pdfParse(buffer);
      const text = parsed.text?.trim();
      if (!text) return Response.json({ error: "PDF illisible ou scanné sans texte" }, { status: 422 });
      raw = await extractFromText(text);
    } else {
      // Send image directly to GPT-4o-mini vision
      const base64 = buffer.toString("base64");
      raw = await extractFromImage(base64, mediaType);
    }

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return Response.json({ error: "Réponse IA invalide", raw }, { status: 422 });

    const data = JSON.parse(match[0]);
    return Response.json(data);
  } catch (err) {
    console.error("[extract-ticket]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
