const BREVO = "https://api.brevo.com/v3";

function h() {
  return { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Récupère tous les contacts d'une liste (paginé, max 2000)
async function fetchAllContacts(listId) {
  const contacts = [];
  let offset = 0;
  const limit = 500;
  while (contacts.length < 2000) {
    const res = await fetch(
      `${BREVO}/contacts/lists/${listId}/contacts?limit=${limit}&offset=${offset}`,
      { headers: h() }
    );
    const data = await res.json();
    if (!data.contacts?.length) break;
    contacts.push(...data.contacts);
    if (data.contacts.length < limit) break;
    offset += limit;
  }
  return contacts;
}

// Découpe un tableau en N chunks de taille égale
function splitIntoChunks(arr, n) {
  const size = Math.ceil(arr.length / n);
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Ajoute un jitter ±30% à un intervalle de base
function jitteredMinutes(baseMinutes) {
  const jitter = (Math.random() - 0.5) * 0.6 * baseMinutes;
  return Math.max(5, Math.round(baseMinutes + jitter));
}

export async function POST(request) {
  const {
    name,
    subject,
    htmlContent,
    replyTo,
    senders,           // [{ id, name, email }]
    sourceListId,
    baseTime,          // ISO ou null (= maintenant + 5 min)
    intervalMinutes = 45,
  } = await request.json();

  if (!name || !subject || !htmlContent || !senders?.length || !sourceListId) {
    return Response.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // 1. Récupérer tous les contacts de la liste source
  const contacts = await fetchAllContacts(sourceListId);
  if (!contacts.length) {
    return Response.json({ error: "Aucun contact dans cette liste" }, { status: 400 });
  }

  const nSenders = Math.min(senders.length, contacts.length);
  const chunks = splitIntoChunks(contacts, nSenders);

  const baseDate = baseTime
    ? new Date(baseTime)
    : new Date(Date.now() + 5 * 60 * 1000); // +5 min par défaut

  const created = [];
  const errors = [];
  let cumulativeMinutes = 0;

  for (let i = 0; i < chunks.length; i++) {
    const sender = senders[i];
    const chunk = chunks[i];

    // 2. Créer une sous-liste dédiée à cet expéditeur
    const subListName = `[Dispatch] ${name} — ${sender.email} — ${Date.now()}`;
    const listRes = await fetch(`${BREVO}/contacts/lists`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ name: subListName, folderId: 1 }),
    });
    const listData = await listRes.json();
    if (!listData.id) {
      errors.push({ sender: sender.email, error: listData.message || "Impossible de créer la sous-liste" });
      continue;
    }

    // 3. Importer les contacts dans la sous-liste
    const payload = chunk.map(c => ({
      email: c.email,
      attributes: c.attributes || {},
    }));
    await fetch(`${BREVO}/contacts/import`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ jsonBody: payload, listIds: [listData.id], updateEnabled: true }),
    });

    // Laisser le temps à Brevo de traiter l'import
    await sleep(2000);

    // 4. Calculer l'heure d'envoi avec jitter irrégulier
    if (i > 0) cumulativeMinutes += jitteredMinutes(intervalMinutes);
    const scheduledAt = new Date(baseDate.getTime() + cumulativeMinutes * 60 * 1000).toISOString();

    // 5. Créer la campagne planifiée
    const campaignRes = await fetch(`${BREVO}/emailCampaigns`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify({
        name: `${name} [${i + 1}/${chunks.length}] — ${sender.email}`,
        subject,
        sender: { name: sender.name, email: sender.email, id: sender.id },
        replyTo: replyTo || sender.email,
        type: "classic",
        htmlContent,
        recipients: { listIds: [listData.id] },
        scheduledAt,
      }),
    });
    const campaignData = await campaignRes.json();

    if (campaignData.id) {
      created.push({
        id: campaignData.id,
        sender: sender.email,
        contacts: chunk.length,
        scheduledAt,
        subListId: listData.id,
      });
    } else {
      errors.push({ sender: sender.email, error: campaignData.message || "Erreur création campagne" });
    }
  }

  return Response.json({ created: created.length, total: contacts.length, campaigns: created, errors });
}
