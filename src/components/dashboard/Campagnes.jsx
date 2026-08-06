"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/src/contexts/ToastContext";

// Expediteurs verifies @colocrew.com.

const SENDERS = [
  { name: "Equipe ColoCrew",       email: "equipe@colocrew.com" },
  { name: "ColoCrew Inscriptions", email: "inscriptions@colocrew.com" },
  { name: "William Dreyer",        email: "w.dreyer@colocrew.com" },
  { name: "ColoCrew Partenaires",  email: "partenaires@colocrew.com" },
];

const TABS = [
  { key: "contacts",  label: "Contacts" },
  { key: "campagne",  label: "Nouvelle campagne" },
  { key: "acompte18", label: "Acompte 18 juin" },
  { key: "historique", label: "Historique" },
];

const TEMPLATES = [
  {
    key: "derniere-offre-aout-2026",
    label: "Derniere offre aout 2026",
    subject: "Dernieres places d'aout : My Creative Surf Camp a 250 EUR apres aide CAF",
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f3f4f6;color:#111827;margin:0;padding:0}
.wrap{max-width:640px;margin:0 auto;background:#fff}
.top{background:#dc2626;color:#fff;padding:24px 28px;text-align:center}
.top .kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin:0 0 8px}
.top h1{font-size:28px;line-height:1.15;margin:0 0 8px;font-weight:800}
.top p{font-size:15px;line-height:1.45;margin:0}
.body{padding:28px}
p{font-size:15px;line-height:1.65;margin:0 0 14px}
.alert{background:#fff1f2;border:1px solid #fecdd3;border-left:5px solid #dc2626;border-radius:8px;padding:14px 16px;margin:0 0 18px}
.alert strong{color:#b91c1c}
.price{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:18px 0}
.price .big{font-size:30px;font-weight:800;color:#dc2626;line-height:1;margin:0 0 6px}
.price .small{font-size:13px;color:#475569;margin:0}
.transport{border-collapse:collapse;width:100%;margin:16px 0 18px;font-size:14px}
.transport th,.transport td{border:1px solid #e5e7eb;padding:10px;text-align:left}
.transport th{background:#f9fafb;font-weight:700;color:#374151}
.cta{display:inline-block;background:#dc2626;color:#fff!important;text-decoration:none;font-weight:800;border-radius:8px;padding:13px 18px;margin:6px 0 18px}
.foot{background:#f9fafb;padding:18px 28px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}
.foot p{font-size:12px;line-height:1.5;margin:0}
</style></head>
<body><div class="wrap">
  <div class="top">
    <p class="kicker">ColoCrew &middot; &Eacute;t&eacute; 2026</p>
    <h1>Derni&egrave;res offres d'ao&ucirc;t</h1>
    <p>Quelques places seulement pour le dernier s&eacute;jour de l'&eacute;t&eacute;.</p>
  </div>

  <div class="body">
    <p><strong>Association ColoCrew</strong></p>

    <p>Bonjour {{params.PRENOM}},</p>

    <div class="alert">
      <p><strong>Derni&egrave;re offre :</strong> il nous reste quelques places pour le s&eacute;jour <strong>My Creative Surf Camp</strong>, du <strong>17 au 28 ao&ucirc;t 2026</strong>.</p>
    </div>

    <p>Pour ce s&eacute;jour, nous vous proposons un prix exceptionnel de <strong>850&nbsp;&euro;</strong>.</p>

    <div class="price">
      <p class="big">250&nbsp;&euro; &agrave; payer</p>
      <p class="small">apr&egrave;s d&eacute;duction de l'aide CAF, selon &eacute;ligibilit&eacute;.</p>
    </div>

    <p>Il reste &eacute;galement des places de transport aller-retour :</p>

    <table class="transport">
      <thead>
        <tr>
          <th>Villes de d&eacute;part</th>
          <th>Prix aller-retour</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Lyon, Montpellier, Paris</td>
          <td><strong>150&nbsp;&euro;</strong></td>
        </tr>
        <tr>
          <td>Bordeaux, Toulouse</td>
          <td><strong>60&nbsp;&euro;</strong></td>
        </tr>
      </tbody>
    </table>

    <p>Au vu des dates et des d&eacute;lais, n'h&eacute;sitez pas &agrave; me contacter directement :</p>

    <a class="cta" href="tel:+33687916897">06 87 91 68 97</a>

    <p>&Agrave; tr&egrave;s bient&ocirc;t,<br>L'&eacute;quipe ColoCrew</p>
  </div>

  <div class="foot">
    <p>R&eacute;pondez avec "STOP" &agrave; ce mail si vous ne souhaitez plus en recevoir.</p>
  </div>
</div></body></html>`,
  },
  {
    key: "hebergement-urgence-2026",
    label: "Recherche hebergement 2026",
    subject: "Recherche urgente d'hebergement groupe ete 2026 - ColoCrew",
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#fff;color:#111827;margin:0;padding:0}
.wrap{max-width:680px;margin:0 auto;padding:24px}
p{font-size:15px;line-height:1.6;margin:0 0 14px}
ul{font-size:15px;line-height:1.6;margin:0 0 14px;padding-left:20px}
.small{font-size:12px;color:#6b7280;margin-top:22px}
</style></head>
<body><div class="wrap">
  <p>Bonjour,</p>

  <p>Je me permets de vous contacter car je suis responsable de l'association ColoCrew, qui organise des s&eacute;jours de vacances pour l'&eacute;t&eacute; 2026.</p>

  <p>Nous sommes actuellement &agrave; la recherche d'un h&eacute;bergement pr&egrave;s de l'oc&eacute;an Atlantique, id&eacute;alement accessible &agrave; pied ou &agrave; v&eacute;lo afin de pouvoir pratiquer le surf, pour une capacit&eacute; d'environ 45 personnes. Si vous n'avez pas cette capacit&eacute;, nous sommes &eacute;galement int&eacute;ress&eacute;s par toute proposition &agrave; partir de 25 personnes.</p>

  <p>Nous avions initialement pr&eacute;vu notre s&eacute;jour au camping Albret Paradis, mais celui-ci vient malheureusement d'annuler notre r&eacute;servation. Nous sommes donc dans une situation assez urgente et compliqu&eacute;e pour reloger nos groupes. Je suis d&eacute;sol&eacute; pour cette demande tardive, mais nous sommes r&eacute;ellement ouverts &agrave; toute proposition qui pourrait nous permettre de maintenir nos s&eacute;jours.</p>

  <p><strong>P&eacute;riode souhait&eacute;e :</strong> du 6 juillet au 29 ao&ucirc;t 2026.</p>

  <p>Si vous n'avez pas de disponibilit&eacute;s sur l'ensemble de l'&eacute;t&eacute;, nous sommes &eacute;galement preneurs d'un devis sur un ou plusieurs des cr&eacute;neaux suivants :</p>
  <ul>
    <li>6 au 18 juillet</li>
    <li>20 juillet au 1er ao&ucirc;t</li>
    <li>3 au 15 ao&ucirc;t</li>
    <li>17 au 29 ao&ucirc;t</li>
  </ul>

  <p>Nous recherchons plut&ocirc;t des h&eacute;bergements en dur : bungalows, g&icirc;tes, chalets, mobil-homes, etc. Dans l'id&eacute;al, nous aimerions &eacute;galement pouvoir disposer d'un espace commun au milieu des h&eacute;bergements pour organiser nos activit&eacute;s et prendre nos repas.</p>

  <p>Pourriez-vous me transmettre, si vous avez des disponibilit&eacute;s :</p>
  <ul>
    <li>un devis selon vos capacit&eacute;s et p&eacute;riodes disponibles ;</li>
    <li>vos modalit&eacute;s d'annulation ;</li>
    <li>vos conditions d'ajustement, notamment si le s&eacute;jour ne se remplit pas totalement avec pr&eacute;avis.</li>
  </ul>

  <p>Vous pouvez en savoir plus sur notre association ici :<br>
  <a href="https://www.colocrew.com">www.colocrew.com</a></p>

  <p>Je reste bien s&ucirc;r &agrave; votre disposition si vous avez besoin de pr&eacute;cisions, directement au 06 87 91 68 97.</p>

  <p>Merci d'avance pour votre aide.</p>

  <p>Bien cordialement,</p>

  <p>William Dreyer<br>Responsable des s&eacute;jours<br>Association ColoCrew</p>

  <p class="small">R&eacute;pondez avec "STOP" &agrave; ce mail si vous ne souhaitez plus en recevoir.</p>
</div></body></html>`,
  },
  {
    key: "juillet-2026",
    label: "Offre juillet 2026",
    subject: "Places disponibles pour les sejours ColoCrew - juillet 2026",
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#fff;color:#111827;margin:0;padding:0}
.wrap{max-width:680px;margin:0 auto;padding:24px}
p{font-size:15px;line-height:1.6;margin:0 0 14px}
ul{font-size:15px;line-height:1.6;margin:0 0 14px;padding-left:20px}
table{border-collapse:collapse;width:100%;margin:16px 0 18px;font-size:14px}
th,td{border:1px solid #d1d5db;padding:9px 10px;text-align:center}
th{background:#f3f4f6;font-weight:700}
td:first-child,th:first-child{text-align:left}
.small{font-size:12px;color:#6b7280;margin-top:22px}
</style></head>
<body><div class="wrap">
  <p>Bonjour,</p>

  <p>Je me permets de vous &eacute;crire afin de vous faire part de notre derni&egrave;re offre pour nos s&eacute;jours de juillet 2026.</p>

  <p>Nous sommes ColoCrew, une association qui propose le type de s&eacute;jour suivant :</p>
  <ul>
    <li>des s&eacute;jours longs en petit effectif : 40 jeunes sur 12 jours ;</li>
    <li>une pratique sportive avec 7 &agrave; 8 s&eacute;ances ;</li>
    <li>un projet artistique collectif : vlog, chant, danse, chor&eacute;graphie, etc. ;</li>
    <li>de la semi-autogestion, avec des repas organis&eacute;s avec les jeunes.</li>
  </ul>

  <p>Nous avons encore quelques places disponibles, notamment &agrave; prix r&eacute;duits pour juillet.</p>

  <p>Nous sommes &eacute;ligibles VACAF, ce qui signifie une r&eacute;duction de 600 &euro; pour chaque jeune avec un QF &lt; 950.</p>

  <p>Cet &eacute;t&eacute;, nous proposons deux s&eacute;jours diff&eacute;rents : un s&eacute;jour surf dans les Landes et un s&eacute;jour montagne avec rafting, via ferrata, etc. Voici les dates et tarifs, une fois les 600 &euro; d&eacute;duits :</p>

  <table>
    <thead>
      <tr>
        <th>S&eacute;jour</th>
        <th>6 au 17 juillet</th>
        <th>20 au 31 juillet</th>
        <th>3 au 14 ao&ucirc;t</th>
        <th>17 au 28 ao&ucirc;t</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Surf</td>
        <td>350 &euro;</td>
        <td>550 &euro;</td>
        <td>550 &euro;</td>
        <td>550 &euro;</td>
      </tr>
      <tr>
        <td>Montagne<br><span style="font-size:12px;color:#6b7280">Rafting, via ferrata, etc.</span></td>
        <td>-</td>
        <td>300 &euro;</td>
        <td>400 &euro;</td>
        <td>-</td>
      </tr>
    </tbody>
  </table>

  <p>Si vous avez des jeunes n&eacute;s en 2015 ou 2014, les s&eacute;jours peuvent m&ecirc;me &ecirc;tre gratuits gr&acirc;ce au PASS-COLO.</p>

  <p>Le d&eacute;tail des s&eacute;jours est disponible sur notre site internet :<br>
  <a href="https://www.colocrew.com">www.colocrew.com</a></p>

  <p>Si je m'adresse au mauvais interlocuteur, n'h&eacute;sitez pas &agrave; transmettre ce mail.</p>

  <p>Les tarifs sont hors transport. Nous pouvons organiser un transport sp&eacute;cifique selon votre ville de d&eacute;part.</p>

  <p>N'h&eacute;sitez pas &agrave; me contacter directement au 06 87 91 68 97 ou par retour de mail si vous &ecirc;tes int&eacute;ress&eacute;s.</p>

  <p>William Dreyer<br>Responsable des s&eacute;jours</p>

  <p class="small">R&eacute;pondez avec "STOP" &agrave; ce mail si vous ne souhaitez plus en recevoir.</p>
</div></body></html>`,
  },
  {
    key: "prospection",
    label: "Prospection séjours",
    subject: "Découvrez les séjours ColoCrew pour vos enfants",
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#f3f4f6;color:#1f2937}
.wrap{max-width:600px;margin:0 auto;background:#fff}
.top{background:#7c3aed;padding:32px 40px;text-align:center;color:#fff}
.top h1{font-size:28px;font-weight:700;margin-bottom:6px}
.top p{font-size:14px;opacity:.85}
.body{padding:32px 40px}
.body p{margin-bottom:16px;line-height:1.7;font-size:15px}
.cta{display:inline-block;background:#7c3aed;color:#fff!important;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;margin:8px 0 24px}
.foot{background:#f9fafb;padding:24px 40px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}
.foot a{color:#7c3aed}
</style></head>
<body><div class="wrap">
  <div class="top"><h1>ColoCrew</h1><p>Des séjours inoubliables pour vos enfants</p></div>
  <div class="body">
    <p>Bonjour {{params.PRENOM}},</p>
    <p>Je me permets de vous contacter car <strong>ColoCrew organise des séjours de vacances pour les enfants de 8 à 17 ans</strong>, encadrés par des animateurs diplômés BAFA.</p>
    <p>✅ Encadrement diplômé et bienveillant<br>✅ Activités variées (sport, nature, arts)<br>✅ Petits groupes de 12 à 20 enfants<br>✅ Aides CAF acceptées</p>
    <a href="https://colocrew.com/sejours" class="cta">Voir tous nos séjours →</a>
    <p>N'hésitez pas à répondre directement à cet email pour toute question.</p>
    <p>Bien cordialement,<br><strong>L'équipe ColoCrew</strong></p>
  </div>
  <div class="foot">
    <p>ColoCrew · <a href="mailto:contact@colocrew.com">contact@colocrew.com</a></p>
    <p style="margin-top:8px">Vous recevez cet email car vous êtes susceptible d'être intéressé(e) par nos séjours.</p>
  </div>
</div></body></html>`,
  },
  {
    key: "relance",
    label: "Relance",
    subject: "Avez-vous eu le temps de regarder nos séjours ?",
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#f3f4f6;color:#1f2937}
.wrap{max-width:600px;margin:0 auto;background:#fff}
.top{background:#0f172a;padding:32px 40px;text-align:center;color:#fff}
.top h1{font-size:26px;font-weight:700}
.body{padding:32px 40px}
.body p{margin-bottom:16px;line-height:1.7;font-size:15px}
.cta{display:inline-block;background:#0f172a;color:#fff!important;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;margin:8px 0 24px}
.foot{background:#f9fafb;padding:24px 40px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}
</style></head>
<body><div class="wrap">
  <div class="top"><h1>ColoCrew</h1></div>
  <div class="body">
    <p>Bonjour {{params.PRENOM}},</p>
    <p>Je reviens vers vous suite à mon précédent message. <strong>Les inscriptions avancent vite</strong> et certains séjours affichent déjà complet.</p>
    <a href="https://colocrew.com/sejours" class="cta">Voir les places disponibles →</a>
    <p>Répondez directement à cet email pour toute question.</p>
    <p>Cordialement,<br><strong>L'équipe ColoCrew</strong></p>
  </div>
  <div class="foot"><p>ColoCrew · contact@colocrew.com</p></div>
</div></body></html>`,
  },
  {
    key: "partenariat",
    label: "Partenariat B2B",
    subject: "Proposition de partenariat — ColoCrew",
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#f3f4f6;color:#1f2937}
.wrap{max-width:600px;margin:0 auto;background:#fff}
.top{background:#059669;padding:32px 40px;text-align:center;color:#fff}
.top h1{font-size:26px;font-weight:700}
.body{padding:32px 40px}
.body p{margin-bottom:16px;line-height:1.7;font-size:15px}
.cta{display:inline-block;background:#059669;color:#fff!important;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;margin:8px 0 24px}
.foot{background:#f9fafb;padding:24px 40px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}
</style></head>
<body><div class="wrap">
  <div class="top"><h1>ColoCrew × Partenariat</h1></div>
  <div class="body">
    <p>Bonjour {{params.PRENOM}},</p>
    <p>Je me permets de vous contacter au sujet d'un <strong>partenariat potentiel</strong> entre nos organisations.</p>
    <p>ColoCrew organise des séjours de vacances pour les 8-17 ans. Nous cherchons des synergies avec des structures partageant nos valeurs.</p>
    <a href="mailto:contact@colocrew.com" class="cta">Me répondre directement →</a>
    <p>Cordialement,<br><strong>L'équipe ColoCrew</strong></p>
  </div>
  <div class="foot"><p>ColoCrew · contact@colocrew.com</p></div>
</div></body></html>`,
  },
];

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h =>
    h.trim().toLowerCase().replace(/["']/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  );
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
  });
  return { headers, rows: rows.filter(r => r.email || r["e-mail"]) };
}

function rowsToContacts(rows) {
  return rows.map(r => ({
    email:  (r.email || r["e-mail"] || "").toLowerCase().trim(),
    prenom: r.prenom || r.firstname || "",
    nom:    r.nom    || r.lastname  || r.name || "",
  })).filter(c => c.email.includes("@") && c.email.includes("."));
}

// ── Styles ───────────────────────────────────────────────────────────────────

const S = {
  input: {
    border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
    fontSize: 14, background: "#fff", outline: "none", minWidth: 200, color: "#1e293b",
  },
  inputFull: {
    border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
    fontSize: 14, background: "#fff", outline: "none", width: "100%", color: "#1e293b",
  },
  label: { fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px" },
};

// ── UI atoms ─────────────────────────────────────────────────────────────────

function Btn({ children, onClick, type = "button", variant = "primary", size = "md", disabled, loading, style }) {
  const base = { border: "none", borderRadius: 8, fontWeight: 600, cursor: (disabled || loading) ? "not-allowed" : "pointer", opacity: (disabled || loading) ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const sizes = { sm: { padding: "6px 14px", fontSize: 13 }, md: { padding: "9px 20px", fontSize: 14 }, lg: { padding: "12px 28px", fontSize: 15 } };
  const variants = {
    primary: { background: "#7c3aed", color: "#fff" },
    danger:  { background: "#ef4444", color: "#fff" },
    ghost:   { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" },
    success: { background: "#10b981", color: "#fff" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {loading && <span style={{ width: 13, height: 13, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />}
      {children}
    </button>
  );
}

function H2({ children, mt = 8 }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 16, marginTop: mt }}>{children}</h2>;
}

// ── Tab: Contacts ────────────────────────────────────────────────────────────

function TabContacts({ lists, setLists }) {
  const { showToast } = useToast();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [csvData, setCsvData] = useState(null);
  const [targetList, setTargetList] = useState("");
  const [importing, setImporting] = useState(false);
  const [openList, setOpenList] = useState(null);
  const [listContacts, setListContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvData(parseCsv(ev.target.result));
    reader.readAsText(file, "UTF-8");
  }

  async function loadLists() {
    const r = await fetch("/api/brevo/lists").then(r => r.json());
    setLists(r.lists || []);
  }

  async function createList() {
    if (!newName.trim()) return;
    setSaving(true);
    const r = await fetch("/api/brevo/lists", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    }).then(r => r.json());
    if (r.id) { showToast("Liste créée", "success"); setNewName(""); loadLists(); }
    else showToast(r.error || "Erreur", "error");
    setSaving(false);
  }

  async function deleteList(id) {
    if (!window.confirm("Supprimer cette liste et tous ses contacts ?")) return;
    await fetch("/api/brevo/contacts", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: id }),
    });
    await fetch("/api/brevo/lists", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    showToast("Liste supprimée", "success");
    loadLists();
  }

  async function importContacts() {
    if (!csvData || !targetList) return showToast("Sélectionnez une liste cible", "error");
    const contacts = rowsToContacts(csvData.rows);
    if (!contacts.length) return showToast("Aucun email valide trouvé", "error");
    setImporting(true);
    const r = await fetch("/api/brevo/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, listId: targetList }),
    }).then(r => r.json());
    if (r.added !== undefined) {
      showToast(`${r.added} contacts importés`, "success");
      setCsvData(null);
      if (fileRef.current) fileRef.current.value = "";
      loadLists();
    } else showToast(r.error || "Erreur import", "error");
    setImporting(false);
  }

  async function viewContacts(listId) {
    if (openList === listId) { setOpenList(null); return; }
    setOpenList(listId);
    setLoadingContacts(true);
    const r = await fetch(`/api/brevo/contacts?listId=${listId}`).then(r => r.json());
    setListContacts(r.contacts || []);
    setLoadingContacts(false);
  }

  return (
    <>
      <H2>Créer une liste</H2>
      <div style={{ display: "flex", gap: 10, marginBottom: 32, alignItems: "flex-end" }}>
        <input style={{ ...S.inputFull, maxWidth: 380 }} placeholder="Nom de la liste (ex: Prospects été 2025)"
          value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && createList()} />
        <Btn onClick={createList} loading={saving}>Créer</Btn>
      </div>

      <H2>Importer un CSV</H2>
      <div style={{ background: "#f8fafc", border: "2px dashed #cbd5e1", borderRadius: 10, padding: "22px", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
          Format — 1ère ligne = en-têtes : <code>email,prenom,nom</code>
        </p>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ fontSize: 13, cursor: "pointer" }} />
      </div>

      {csvData && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: "#059669", fontWeight: 600, marginBottom: 10 }}>
            ✓ {csvData.rows.length} lignes — colonnes : {csvData.headers.join(", ")}
          </div>
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 300 }}>
              <thead><tr>{csvData.headers.map(h => <th key={h} style={{ background: "#f1f5f9", padding: "6px 14px", border: "1px solid #e2e8f0", textAlign: "left", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {csvData.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{csvData.headers.map(h => <td key={h} style={{ padding: "6px 14px", border: "1px solid #f1f5f9" }}>{r[h]}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {csvData.rows.length > 5 && <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>+ {csvData.rows.length - 5} autres…</p>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select style={S.input} value={targetList} onChange={e => setTargetList(e.target.value)}>
              <option value="">Liste cible…</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count} contacts)</option>)}
            </select>
            <Btn onClick={importContacts} loading={importing}>Importer {csvData.rows.length} contacts</Btn>
            <Btn variant="ghost" onClick={() => { setCsvData(null); if (fileRef.current) fileRef.current.value = ""; }}>Annuler</Btn>
          </div>
        </div>
      )}

      <H2 mt={32}>Mes listes ({lists.length})</H2>
      {!lists.length ? (
        <p style={{ color: "#94a3b8", fontSize: 14 }}>Aucune liste créée.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lists.map(l => (
            <div key={l.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</span>
                  <span style={{ fontSize: 12, color: "#64748b", marginLeft: 10 }}>{l.count} contact(s)</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="ghost" size="sm" onClick={() => viewContacts(l.id)}>
                    {openList === l.id ? "Masquer" : "Voir"}
                  </Btn>
                  <Btn variant="danger" size="sm" onClick={() => deleteList(l.id)}>Supprimer</Btn>
                </div>
              </div>
              {openList === l.id && (
                <div style={{ padding: "12px 18px", background: "#fafafa", border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                  {loadingContacts ? (
                    <p style={{ fontSize: 13, color: "#94a3b8" }}>Chargement…</p>
                  ) : !listContacts.length ? (
                    <p style={{ fontSize: 13, color: "#94a3b8" }}>Aucun contact dans cette liste.</p>
                  ) : (
                    <>
                      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{listContacts.length} contacts :</p>
                      <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
                        {listContacts.map((c, i) => (
                          <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
                            <strong>{c.prenom} {c.nom}</strong> — {c.email}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Tab: Nouvelle campagne ────────────────────────────────────────────────────

const SPEED_OPTIONS = [
  { label: "Lent — 10s entre chaque (très sûr)",      value: 10000 },
  { label: "Normal — 3s entre chaque (recommandé)",   value: 3000  },
  { label: "Rapide — 1s entre chaque (petites listes)", value: 1000  },
];

function TabCampagne({ lists }) {
  const { showToast } = useToast();

  // Formulaire
  const [subject,     setSubject]     = useState(TEMPLATES[0].subject);
  const [html,        setHtml]        = useState(TEMPLATES[0].html);
  const [replyTo,     setReplyTo]     = useState("equipe@colocrew.com");
  const [preview,     setPreview]     = useState(false);
  const [delayMs,     setDelayMs]     = useState(3000);

  // Source contacts
  const [sourceMode,  setSourceMode]  = useState("list"); // "list" | "csv"
  const [listId,      setListId]      = useState("");
  const [csvContacts, setCsvContacts] = useState(null);
  const fileRef = useRef();

  // Senders rotation
  const [selectedSenders, setSelectedSenders] = useState(SENDERS.map((_, i) => i));

  // Test
  const [testEmail,   setTestEmail]   = useState("");
  const [testSender,  setTestSender]  = useState(0);
  const [testing,     setTesting]     = useState(false);

  // Dispatch state
  const [dispatching,  setDispatching]  = useState(false);
  const [progress,     setProgress]     = useState(null);
  const [dispatchDone, setDispatchDone] = useState(null);
  const [activeRunId,  setActiveRunId]  = useState(null);
  const [savedRun,     setSavedRun]     = useState(null);
  const [savedEvents,  setSavedEvents]  = useState([]);
  const [controllingRun, setControllingRun] = useState(false);

  const loadRun = useCallback(async (runId) => {
    if (!runId) return;
    const r = await fetch(`/api/brevo/runs/${runId}`).then(r => r.json());
    if (r.run) {
      setSavedRun(r.run);
      setSavedEvents(r.events || []);
    }
  }, []);

  const loadLatestRun = useCallback(async () => {
    const r = await fetch("/api/brevo/runs?limit=1").then(r => r.json());
    const latest = r.runs?.[0];
    if (latest) {
      setActiveRunId(latest.id);
      setSavedRun(latest);
      await loadRun(latest.id);
    }
  }, [loadRun]);

  useEffect(() => { loadLatestRun(); }, [loadLatestRun]);

  useEffect(() => {
    if (!activeRunId) return;
    const timer = setInterval(() => loadRun(activeRunId), 3000);
    return () => clearInterval(timer);
  }, [activeRunId, loadRun]);

  async function controlRun(runId, action) {
    if (!runId) return;
    setControllingRun(true);
    try {
      const r = await fetch(`/api/brevo/runs/${runId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then(r => r.json());
      showToast(r.ok ? `Demande ${action} envoyee` : (r.error || "Erreur"), r.ok ? "success" : "error");
      await loadRun(runId);
    } catch {
      showToast("Impossible d'envoyer la demande", "error");
    }
    setControllingRun(false);
  }

  function pickTemplate(key) {
    const t = TEMPLATES.find(t => t.key === key);
    if (t) { setSubject(t.subject); setHtml(t.html); }
  }

  function prepareJuillet2026() {
    const list = lists.find(l => l.name === "Offre juillet 2026 - priorite 1")
      || lists.find(l => l.name === "Offre juillet 2026 - tous");
    pickTemplate("juillet-2026");
    setSourceMode("list");
    if (list) setListId(list.id);
    setSelectedSenders(SENDERS.map((_, i) => i));
    setDelayMs(3000);
    setPreview(true);
    showToast(
      list
        ? `Offre juillet 2026 prete avec la liste "${list.name}"`
        : "Offre juillet 2026 prete. Selectionnez une liste avant l'envoi.",
      list ? "success" : "info"
    );
  }

  function toggleSender(i) {
    setSelectedSenders(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  }

  function handleCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvContacts(rowsToContacts(parseCsv(ev.target.result).rows));
    reader.readAsText(file, "UTF-8");
  }

  async function sendTest() {
    if (!testEmail) return showToast("Renseignez l'adresse de test", "error");
    if (!subject || !html) return showToast("Renseignez l'objet et le contenu", "error");
    setTesting(true);
    const r = await fetch("/api/brevo/test-send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testEmail, sender: SENDERS[testSender], subject, htmlContent: html, replyTo }),
    }).then(r => r.json());
    showToast(r.ok ? `Test envoyé à ${testEmail}` : (r.error || "Erreur"), r.ok ? "success" : "error");
    setTesting(false);
  }

  async function launchDispatch() {
    if (!subject || !html) return showToast("Objet et contenu requis", "error");
    if (!replyTo) return showToast("L'adresse Reply-to est obligatoire — c'est là que vous recevrez les réponses", "error");
    if (!selectedSenders.length) return showToast("Sélectionnez au moins un expéditeur", "error");

    let contacts = [];
    let selectedListName = "";
    if (sourceMode === "list") {
      if (!listId) return showToast("Sélectionnez une liste", "error");
      const r = await fetch(`/api/brevo/contacts?listId=${listId}`).then(r => r.json());
      contacts = r.contacts || [];
      selectedListName = lists.find(l => l.id === listId)?.name || "";
    } else {
      if (!csvContacts?.length) return showToast("Chargez un fichier CSV", "error");
      contacts = csvContacts;
    }
    if (!contacts.length) return showToast("Aucun contact à envoyer", "error");

    const senders = selectedSenders.map(i => SENDERS[i]);
    setDispatching(true);
    setProgress({ sent: 0, errors: 0, total: contacts.length, current: null });
    setDispatchDone(null);

    try {
      const res = await fetch("/api/brevo/dispatch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, senders, subject, htmlContent: html, replyTo, delayMs, sourceMode, listId, listName: selectedListName, maxPerRequest: 8 }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let runIdToResume = "";
      let shouldResume = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "start") {
              runIdToResume = msg.runId;
              setActiveRunId(msg.runId);
              setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
              loadRun(msg.runId);
            }
            if (msg.type === "ok" || msg.type === "err") {
              setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: msg.email });
              if (msg.runId) loadRun(msg.runId);
            }
            if (msg.type === "batchDone") {
              runIdToResume = msg.runId;
              shouldResume = true;
              setActiveRunId(msg.runId);
              setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
              if (msg.runId) loadRun(msg.runId);
            }
            if (msg.type === "done") {
              setDispatchDone(msg);
              if (msg.runId) loadRun(msg.runId);
              showToast(`Terminé ! ${msg.sent}/${msg.total} emails envoyés`, "success");
            }
          } catch {/* ligne incomplète */}
        }
      }

      while (shouldResume && runIdToResume) {
        shouldResume = false;
        await new Promise(resolve => setTimeout(resolve, 800));
        const resumeRes = await fetch(`/api/brevo/runs/${runIdToResume}/resume`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxPerRequest: 8 }),
        });
        if (!resumeRes.ok || !resumeRes.body) {
          const data = await resumeRes.json().catch(() => ({}));
          throw new Error(data.error || "Erreur pendant la reprise de l'envoi");
        }

        const resumeReader = resumeRes.body.getReader();
        const resumeDecoder = new TextDecoder();
        while (true) {
          const { value, done } = await resumeReader.read();
          if (done) break;
          const lines = resumeDecoder.decode(value).split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const msg = JSON.parse(line);
              if (msg.type === "start") {
                runIdToResume = msg.runId;
                setActiveRunId(msg.runId);
                setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
                loadRun(msg.runId);
              }
              if (msg.type === "ok" || msg.type === "err") {
                setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: msg.email });
                if (msg.runId) loadRun(msg.runId);
              }
              if (msg.type === "batchDone") {
                runIdToResume = msg.runId;
                shouldResume = true;
                setActiveRunId(msg.runId);
                setProgress({ sent: msg.sent, errors: msg.errors, total: msg.total, current: null });
                if (msg.runId) loadRun(msg.runId);
              }
              if (msg.type === "done") {
                setDispatchDone(msg);
                if (msg.runId) loadRun(msg.runId);
                showToast(`TerminÃ© ! ${msg.sent}/${msg.total} emails envoyÃ©s`, "success");
                shouldResume = false;
              }
            } catch {/* ligne incomplÃ¨te */}
          }
        }
      }
    } catch (err) {
      showToast("Erreur de connexion pendant l'envoi", "error");
    }
    setDispatching(false);
  }

  const pct = progress ? Math.round((progress.sent / progress.total) * 100) : 0;
  const savedPct = savedRun?.total ? Math.round(((savedRun.sent || 0) / savedRun.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 820 }}>

      {/* Templates */}
      <H2>Template</H2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {TEMPLATES.map(t => (
          <button key={t.key} type="button" onClick={() => pickTemplate(t.key)}
            style={{ padding: "7px 14px", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#f8fafc", fontSize: 13, cursor: "pointer", fontWeight: 500, color: "#475569" }}>
            {t.label}
          </button>
        ))}
        <button type="button" onClick={prepareJuillet2026}
          style={{ padding: "7px 14px", borderRadius: 6, border: "1.5px solid #7c3aed", background: "#f5f3ff", fontSize: 13, cursor: "pointer", fontWeight: 700, color: "#6d28d9" }}>
          Preparer l'envoi juillet 2026
        </button>
      </div>

      {/* Objet + Reply-to */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <label style={S.label}>Objet de l'email</label>
          <input style={S.inputFull} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Objet visible par le destinataire" />
        </div>
        <div>
          <label style={S.label}>
            Reply-to — <strong style={{ color: "#dc2626" }}>les réponses de vos prospects arrivent ICI</strong>
          </label>
          <input
            style={{ ...S.inputFull, borderColor: replyTo ? "#e2e8f0" : "#fca5a5", background: replyTo ? "#fff" : "#fff7f7" }}
            type="email"
            value={replyTo}
            onChange={e => setReplyTo(e.target.value)}
            placeholder="equipe@colocrew.com"
          />
          {!replyTo && (
            <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4, fontWeight: 600 }}>
              ⚠ Champ obligatoire — sans reply-to, les réponses partent vers une adresse non surveillée
            </p>
          )}
          {replyTo && (
            <p style={{ fontSize: 12, color: "#059669", marginTop: 4 }}>
              ✓ Les prospects qui répondent écriront à <strong>{replyTo}</strong>
            </p>
          )}
        </div>
      </div>

      {/* Contenu HTML */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ ...S.label, margin: 0 }}>Contenu HTML</label>
          <Btn variant="ghost" size="sm" onClick={() => setPreview(p => !p)}>{preview ? "← Éditer" : "Prévisualiser →"}</Btn>
        </div>
        {preview ? (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", height: 440 }}>
            <iframe srcDoc={html} style={{ width: "100%", height: "100%", border: "none" }} sandbox="allow-same-origin" title="Aperçu" />
          </div>
        ) : (
          <textarea value={html} onChange={e => setHtml(e.target.value)}
            style={{ ...S.inputFull, height: 300, fontFamily: "monospace", fontSize: 12, resize: "vertical", lineHeight: 1.5 }} />
        )}
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>
          Perso : <code>{"{{params.PRENOM}}"}</code> · <code>{"{{params.NOM}}"}</code>
        </p>
      </div>

      {/* Source contacts */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <H2 mt={0}>Source des contacts</H2>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[{ k: "list", l: "Depuis une liste sauvegardée" }, { k: "csv", l: "Importer un CSV maintenant" }].map(({ k, l }) => (
            <button key={k} type="button" onClick={() => setSourceMode(k)} style={{
              padding: "8px 16px", borderRadius: 8, border: "1.5px solid",
              borderColor: sourceMode === k ? "#7c3aed" : "#e2e8f0",
              background: sourceMode === k ? "#f5f3ff" : "#fff",
              color: sourceMode === k ? "#7c3aed" : "#475569",
              fontSize: 13, cursor: "pointer", fontWeight: 600,
            }}>{l}</button>
          ))}
        </div>
        {sourceMode === "list" ? (
          <select style={{ ...S.input, width: "100%", maxWidth: 400 }} value={listId} onChange={e => setListId(e.target.value)}>
            <option value="">Choisir une liste…</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count} contacts)</option>)}
          </select>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>Format : <code>email,prenom,nom</code></p>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} style={{ fontSize: 13, cursor: "pointer" }} />
            {csvContacts && (
              <p style={{ fontSize: 13, color: "#059669", fontWeight: 600, marginTop: 8 }}>✓ {csvContacts.length} contacts valides chargés</p>
            )}
          </>
        )}
      </div>

      {/* Expéditeurs */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <H2 mt={0}>Expéditeurs en rotation</H2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          Domaine <strong>colocrew.com</strong> déjà vérifié — toutes ces adresses fonctionnent directement.
          Les emails seront envoyés en rotation circulaire entre les expéditeurs sélectionnés.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 6 }}>
          {SENDERS.map((s, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: selectedSenders.includes(i) ? "#ede9fe" : "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={selectedSenders.includes(i)} onChange={() => toggleSender(i)} />
              <div>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{s.email}</div>
              </div>
            </label>
          ))}
        </div>
        {selectedSenders.length > 0 && (
          <p style={{ fontSize: 12, color: "#7c3aed", marginTop: 10, fontWeight: 600 }}>
            {selectedSenders.length} expéditeur(s) sélectionné(s) — rotation circulaire automatique
          </p>
        )}
      </div>

      {/* Vitesse d'envoi */}
      <div style={{ marginBottom: 24 }}>
        <label style={S.label}>Vitesse d'envoi (délai entre chaque email)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SPEED_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setDelayMs(opt.value)} style={{
              padding: "8px 16px", borderRadius: 8, border: "1.5px solid",
              borderColor: delayMs === opt.value ? "#7c3aed" : "#e2e8f0",
              background: delayMs === opt.value ? "#f5f3ff" : "#fff",
              color: delayMs === opt.value ? "#7c3aed" : "#475569",
              fontSize: 13, cursor: "pointer", fontWeight: 600,
            }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Bouton lancer */}
      {!dispatching && !dispatchDone && (
        <Btn size="lg" onClick={launchDispatch}>Lancer la campagne</Btn>
      )}

      {/* Progression en temps réel */}
      {(dispatching || dispatchDone) && progress && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {dispatchDone ? "Envoi terminé ✓" : "Envoi en cours…"}
            </span>
            <span style={{ fontSize: 13, color: "#64748b" }}>{progress.sent} / {progress.total}</span>
          </div>
          <div style={{ background: "#e2e8f0", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", background: dispatchDone ? "#10b981" : "#7c3aed", width: `${pct}%`, transition: "width .4s ease" }} />
          </div>
          <div style={{ fontSize: 12, color: "#64748b", display: "flex", gap: 20 }}>
            <span style={{ color: "#10b981" }}>✓ {progress.sent} envoyés</span>
            {progress.errors > 0 && <span style={{ color: "#ef4444" }}>✗ {progress.errors} erreurs</span>}
            {!dispatchDone && progress.current && <span>En cours : {progress.current}</span>}
          </div>
          {dispatchDone && (
            <Btn variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => { setProgress(null); setDispatchDone(null); }}>
              Nouvelle campagne
            </Btn>
          )}
        </div>
      )}

      {savedRun && (
        <div style={{ ...S.card, marginTop: 20, marginBottom: 20, borderColor: savedRun.status === "running" ? "#7c3aed" : "#e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: 0 }}>Suivi sauvegarde de la campagne</h3>
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 0 }}>{savedRun.subject}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {savedRun.status === "running" && (
                <>
                  <Btn variant="ghost" size="sm" onClick={() => controlRun(savedRun.id, "pause")} loading={controllingRun}>Pause</Btn>
                  <Btn variant="danger" size="sm" onClick={() => controlRun(savedRun.id, "stop")} loading={controllingRun}>Stop</Btn>
                </>
              )}
              <Btn variant="ghost" size="sm" onClick={() => loadRun(savedRun.id)}>Actualiser</Btn>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Statut</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{savedRun.status}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Envoyes</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{savedRun.sent || 0} / {savedRun.total || 0}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Erreurs</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: savedRun.errors ? "#dc2626" : "#15803d" }}>{savedRun.errors || 0}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Progression</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{savedPct}%</div>
            </div>
          </div>
          <div style={{ background: "#e2e8f0", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", background: savedRun.status === "done" ? "#10b981" : "#7c3aed", width: `${savedPct}%`, transition: "width .4s ease" }} />
          </div>
          {savedRun.currentEmail && (
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
              En cours : <strong>{savedRun.currentEmail}</strong> via <strong>{savedRun.currentSender}</strong>
            </p>
          )}
          {!!savedEvents.length && (
            <div style={{ maxHeight: 180, overflowY: "auto", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
              {savedEvents.slice(0, 12).map(ev => (
                <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ color: ev.type === "error" ? "#dc2626" : "#15803d", fontWeight: 700 }}>{ev.type}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.email || ev.message || ""}</span>
                  <span style={{ color: "#64748b" }}>{ev.sender || ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test d'envoi */}
      <div style={{ ...S.card, marginTop: 32, background: "#fafafa" }}>
        <H2 mt={0}>🧪 Email de test</H2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
          Envoie le contenu actuel vers une adresse de test. L'objet sera préfixé <code>[TEST]</code>, les variables remplacées par des exemples.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={S.label}>Adresse de destination</label>
            <input style={S.input} type="email" placeholder="ton@email.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Expéditeur du test</label>
            <select style={S.input} value={testSender} onChange={e => setTestSender(Number(e.target.value))}>
              {SENDERS.map((s, i) => <option key={i} value={i}>{s.email}</option>)}
            </select>
          </div>
          <Btn variant="success" onClick={sendTest} loading={testing}>Envoyer le test</Btn>
        </div>
      </div>

      {/* Conseils */}
      <div style={{ marginTop: 20, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "16px 20px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>⚠️ Anti-spam</h3>
        <ul style={{ fontSize: 12, color: "#78350f", lineHeight: 1.9, paddingLeft: 18 }}>
          <li>Commence par 50–100 emails/jour, augmente progressivement (warm-up)</li>
          <li>Privilégie le mode Lent ou Normal pour les grosses listes</li>
          <li>Planifie en heures ouvrées : mar–jeu, 10h–12h ou 14h–16h</li>
          <li>Les réponses arrivent dans la boîte du <strong>Reply-to</strong> configuré ci-dessus</li>
        </ul>
      </div>
    </div>
  );
}

// ── Tab: Historique ───────────────────────────────────────────────────────────

function TabAcompte18Juin() {
  const { showToast } = useToast();
  const fileRef = useRef();
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [senderIndex, setSenderIndex] = useState(1);
  const [replyTo, setReplyTo] = useState("inscriptions@colocrew.com");
  const [delayMs, setDelayMs] = useState(3000);
  const [dispatching, setDispatching] = useState(false);
  const [progress, setProgress] = useState(null);
  const [activeRunId, setActiveRunId] = useState(null);
  const [events, setEvents] = useState([]);
  const [controllingRun, setControllingRun] = useState(false);

  const families = parsed?.families || [];
  const selectedFamilies = families.filter((family) => selected[family.numeroDeReservation]);
  const pct = progress?.total ? Math.round((progress.sent / progress.total) * 100) : 0;

  async function parseWorkbook(mode = "default") {
    setLoading(true);
    try {
      const form = new FormData();
      if (mode === "default") {
        form.append("useDefault", "true");
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          showToast("Choisis un fichier XLSX", "error");
          setLoading(false);
          return;
        }
        form.append("file", file);
      }

      const response = await fetch("/api/acompte-18-juin/parse", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lecture impossible");

      setParsed(data);
      setSelected(Object.fromEntries((data.families || []).map((family) => [family.numeroDeReservation, Boolean(family.valid)])));
      showToast(`${data.summary.validFamilies}/${data.summary.families} familles prêtes`, "success");
    } catch (err) {
      showToast(err.message || "Erreur de lecture", "error");
    }
    setLoading(false);
  }

  async function loadRun(runId) {
    if (!runId) return;
    try {
      const data = await fetch(`/api/brevo/runs/${runId}`).then((r) => r.json());
      setEvents(data.events || []);
    } catch {
      // Le suivi Firebase est utile mais ne doit pas bloquer l'envoi.
    }
  }

  async function controlRun(action) {
    if (!activeRunId) return;
    setControllingRun(true);
    try {
      const r = await fetch(`/api/brevo/runs/${activeRunId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then((res) => res.json());
      showToast(r.ok ? `Demande ${action} envoyée` : (r.error || "Erreur"), r.ok ? "success" : "error");
      await loadRun(activeRunId);
    } catch {
      showToast("Impossible d'envoyer la demande", "error");
    }
    setControllingRun(false);
  }

  async function launchDispatch() {
    if (!selectedFamilies.length) return showToast("Sélectionne au moins une famille", "error");
    if (!replyTo) return showToast("Reply-to obligatoire", "error");
    if (!window.confirm(`Envoyer la relance acompte à ${selectedFamilies.length} famille(s) ?`)) return;

    setDispatching(true);
    setProgress({ sent: 0, errors: 0, total: selectedFamilies.length, current: null });
    setEvents([]);

    try {
      const res = await fetch("/api/acompte-18-juin/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          families: selectedFamilies,
          sender: SENDERS[senderIndex],
          replyTo,
          delayMs,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Envoi impossible");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "start") {
              setActiveRunId(msg.runId);
              setProgress({
                sent: msg.sent,
                errors: msg.errors,
                total: msg.total,
                selectedTotal: msg.selectedTotal,
                skippedUnsubscribed: msg.skippedUnsubscribed,
                skippedAlreadySent: msg.skippedAlreadySent,
                skippedInvalid: msg.skippedInvalid,
                current: null,
              });
              loadRun(msg.runId);
            }
            if (msg.type === "ok" || msg.type === "err") {
              setProgress((prev) => ({
                ...prev,
                sent: msg.sent,
                errors: msg.errors,
                total: msg.total,
                current: msg.email,
              }));
              if (msg.runId) loadRun(msg.runId);
            }
            if (msg.type === "done") {
              setProgress((prev) => ({
                ...prev,
                sent: msg.sent,
                errors: msg.errors,
                total: msg.total,
                selectedTotal: msg.selectedTotal ?? prev?.selectedTotal,
                skippedUnsubscribed: msg.skippedUnsubscribed ?? prev?.skippedUnsubscribed,
                skippedAlreadySent: msg.skippedAlreadySent ?? prev?.skippedAlreadySent,
                skippedInvalid: msg.skippedInvalid ?? prev?.skippedInvalid,
                current: null,
              }));
              if (msg.runId) loadRun(msg.runId);
              showToast(`Terminé : ${msg.sent}/${msg.total} relances envoyées`, "success");
            }
            if (msg.type === "paused" || msg.type === "stopped") {
              showToast(`Envoi ${msg.type}`, "info");
            }
          } catch {
            // ligne incomplète
          }
        }
      }
    } catch (err) {
      showToast(err.message || "Erreur pendant l'envoi", "error");
    }

    setDispatching(false);
  }

  function toggleFamily(reference) {
    setSelected((prev) => ({ ...prev, [reference]: !prev[reference] }));
  }

  function selectAllValid() {
    setSelected(Object.fromEntries(families.map((family) => [family.numeroDeReservation, Boolean(family.valid)])));
  }

  function clearSelection() {
    setSelected(Object.fromEntries(families.map((family) => [family.numeroDeReservation, false])));
  }

  return (
    <div style={{ maxWidth: 1120 }}>
      <div style={S.card}>
        <H2 mt={0}>Fichier acompte 18 juin</H2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Btn onClick={() => parseWorkbook("default")} loading={loading}>Charger le fichier Downloads</Btn>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ ...S.input, minWidth: 280 }} />
          <Btn variant="ghost" onClick={() => parseWorkbook("upload")} loading={loading}>Importer ce fichier</Btn>
        </div>
        <p style={{ fontSize: 12, color: "#64748b", margin: "10px 0 0" }}>
          Les lignes sans prix sont rattachées à la famille précédente. Les deux colonnes transport sont séparées entre montant et ville.
        </p>
      </div>

      {parsed && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, margin: "16px 0" }}>
            <Stat label="Familles" value={parsed.summary.families} />
            <Stat label="Valides" value={parsed.summary.validFamilies} />
            <Stat label="Enfants" value={parsed.summary.children} />
            <Stat label="Prix recalculés" value={parsed.summary.calculatedPrices} />
            <Stat label="Total reste à charge" value={fmtMoney(parsed.summary.totalDue)} />
          </div>

          <div style={S.card}>
            <H2 mt={0}>Paramètres d'envoi</H2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 220px", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Expéditeur</label>
                <select style={S.inputFull} value={senderIndex} onChange={(e) => setSenderIndex(Number(e.target.value))}>
                  {SENDERS.map((sender, i) => (
                    <option key={sender.email} value={i}>{sender.name} - {sender.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Reply-to</label>
                <input style={S.inputFull} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Rythme</label>
                <select style={S.inputFull} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))}>
                  <option value={10000}>Lent - 10s</option>
                  <option value={3000}>Normal - 3s</option>
                  <option value={1000}>Rapide - 1s</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Btn onClick={launchDispatch} loading={dispatching} disabled={!selectedFamilies.length}>
                Envoyer {selectedFamilies.length} relance(s) acompte
              </Btn>
              <Btn variant="ghost" onClick={selectAllValid}>Tout cocher valide</Btn>
              <Btn variant="ghost" onClick={clearSelection}>Tout décocher</Btn>
              {dispatching && activeRunId && (
                <>
                  <Btn variant="ghost" onClick={() => controlRun("pause")} loading={controllingRun}>Pause</Btn>
                  <Btn variant="danger" onClick={() => controlRun("stop")} loading={controllingRun}>Stop</Btn>
                </>
              )}
            </div>

            {progress && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                  <span>
                    {progress.sent}/{progress.total} envoyés - {progress.errors} erreur(s)
                    {progress.selectedTotal > progress.total && ` - ${progress.selectedTotal - progress.total} ignoré(s)`}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: progress.errors ? "#ef4444" : "#10b981", transition: "width .3s ease" }} />
                </div>
                {progress.current && <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>En cours : <strong>{progress.current}</strong></p>}
                {progress.selectedTotal > progress.total && (
                  <p style={{ fontSize: 12, color: "#92400e", marginTop: 8 }}>
                    {progress.selectedTotal} familles sélectionnées, {progress.total} envoyables.
                    {progress.skippedUnsubscribed ? ` ${progress.skippedUnsubscribed} email(s) ignoré(s), car déjà dans la liste des désinscriptions.` : ""}
                    {progress.skippedAlreadySent ? ` ${progress.skippedAlreadySent} email(s) déjà envoyé(s).` : ""}
                    {progress.skippedInvalid ? ` ${progress.skippedInvalid} fiche(s) invalide(s).` : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          <H2 mt={18}>Familles à relancer</H2>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "42px 170px minmax(180px, 1fr) 170px 110px 120px 180px", gap: 8, padding: "10px 12px", background: "#f8fafc", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              <span />
              <span>Responsable</span>
              <span>Email / enfants</span>
              <span>Séjour</span>
              <span>CAF</span>
              <span>Reste</span>
              <span>Statut</span>
            </div>
            <div style={{ maxHeight: 540, overflowY: "auto" }}>
              {families.map((family) => (
                <div key={family.numeroDeReservation} style={{ display: "grid", gridTemplateColumns: "42px 170px minmax(180px, 1fr) 170px 110px 120px 180px", gap: 8, alignItems: "center", padding: "10px 12px", borderTop: "1px solid #f1f5f9", fontSize: 12 }}>
                  <input type="checkbox" checked={Boolean(selected[family.numeroDeReservation])} disabled={!family.valid} onChange={() => toggleFamily(family.numeroDeReservation)} />
                  <div>
                    <strong style={{ color: "#1e293b" }}>{family.responsible?.fullName || "Sans nom"}</strong>
                    <div style={{ color: "#94a3b8" }}>{family.numeroDeReservation}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: family.email ? "#1e293b" : "#dc2626", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{family.email || "Email manquant"}</div>
                    <div style={{ color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(family.children || []).map((child) => `${child.firstName} ${child.lastName}`.trim()).filter(Boolean).join(", ")}
                    </div>
                  </div>
                  <div>
                    <strong>{family.stayName || family.stayCode || "-"}</strong>
                    <div style={{ color: "#64748b" }}>{family.week} {family.transportCity ? `- ${family.transportCity}` : ""}</div>
                  </div>
                  <div>{fmtMoney(family.pricing?.cafAid)}</div>
                  <div>
                    <strong style={{ color: "#B8336A" }}>{fmtMoney(family.pricing?.totalDue)}</strong>
                    <div style={{ color: "#64748b" }}>après acompte {fmtMoney(family.pricing?.remainingAfterDeposit)}</div>
                  </div>
                  <div>
                    {family.valid ? (
                      <span style={{ color: "#15803d", fontWeight: 700 }}>Prêt</span>
                    ) : (
                      <span style={{ color: "#dc2626", fontWeight: 700 }}>{family.warnings?.join(", ") || "À vérifier"}</span>
                    )}
                    {family.pricing?.priceWasCalculated && <div style={{ color: "#7c3aed" }}>Prix calculé</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {events.length > 0 && (
            <>
              <H2 mt={18}>Derniers envois</H2>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                {events.slice(0, 20).map((event) => (
                  <div key={event.id} style={{ display: "grid", gridTemplateColumns: "80px minmax(0, 1fr) 120px", gap: 10, padding: "9px 12px", borderTop: "1px solid #f1f5f9", fontSize: 12 }}>
                    <strong style={{ color: event.type === "error" ? "#dc2626" : "#15803d" }}>{event.type}</strong>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.email || event.message}</span>
                    <span style={{ color: "#64748b" }}>{event.reference || ""}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#1e293b" }}>{value}</div>
    </div>
  );
}

function fmtMoney(value) {
  const n = Number(value || 0);
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

function TabHistoriqueFirebase() {
  const { showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [controlling, setControlling] = useState(false);

  const loadRun = useCallback(async (runId) => {
    const r = await fetch(`/api/brevo/runs/${runId}`).then(r => r.json());
    if (r.run) {
      setSelectedRun(r.run);
      setEvents(r.events || []);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/brevo/runs?limit=20").then(r => r.json());
      setRuns(r.runs || []);
      if (r.runs?.[0]) await loadRun(r.runs[0].id);
    } catch {
      showToast("Impossible de charger l'historique Firebase", "error");
    }
    setLoading(false);
  }, [loadRun, showToast]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  useEffect(() => {
    if (!selectedRun?.id || selectedRun.status !== "running") return;
    const timer = setInterval(() => loadRun(selectedRun.id), 3000);
    return () => clearInterval(timer);
  }, [selectedRun?.id, selectedRun?.status, loadRun]);

  function formatDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }

  async function resumeRun(runId) {
    if (!runId) return;
    setResuming(true);
    try {
      const res = await fetch(`/api/brevo/runs/${runId}/resume`, { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Impossible de reprendre cette campagne", "error");
        setResuming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "start" || msg.type === "ok" || msg.type === "err" || msg.type === "done") {
              await loadRun(runId);
            }
            if (msg.type === "done") {
              showToast(`Reprise terminee : ${msg.sent}/${msg.total} emails envoyes`, "success");
            }
          } catch {/* ligne incomplete */}
        }
      }
      await loadRuns();
    } catch {
      showToast("Erreur pendant la reprise de campagne", "error");
    }
    setResuming(false);
  }

  async function controlRun(runId, action) {
    if (!runId) return;
    setControlling(true);
    try {
      const r = await fetch(`/api/brevo/runs/${runId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then(r => r.json());
      showToast(r.ok ? `Demande ${action} envoyee` : (r.error || "Erreur"), r.ok ? "success" : "error");
      await loadRun(runId);
    } catch {
      showToast("Impossible d'envoyer la demande", "error");
    }
    setControlling(false);
  }

  const pct = selectedRun?.total ? Math.round(((selectedRun.sent || 0) / selectedRun.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <H2 mt={0}>Historique Firebase</H2>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: -8 }}>
            Donnees issues des campagnes lancees depuis l'outil ColoCrew.
          </p>
        </div>
        <Btn variant="ghost" size="sm" onClick={loadRuns} loading={loading}>Actualiser</Btn>
      </div>

      {loading && !runs.length ? (
        <p style={{ color: "#94a3b8", fontSize: 14 }}>Chargement de l'historique...</p>
      ) : !runs.length ? (
        <div style={{ ...S.card, color: "#64748b", fontSize: 14 }}>Aucune campagne sauvegardee pour le moment.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map(run => {
              const runPct = run.total ? Math.round(((run.sent || 0) / run.total) * 100) : 0;
              const active = selectedRun?.id === run.id;
              return (
                <button key={run.id} type="button" onClick={() => loadRun(run.id)}
                  style={{ textAlign: "left", background: active ? "#f5f3ff" : "#fff", border: `1.5px solid ${active ? "#7c3aed" : "#e2e8f0"}`, borderRadius: 8, padding: 12, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <strong style={{ fontSize: 13, color: "#1e293b" }}>{run.status}</strong>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{runPct}%</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.4, marginBottom: 6 }}>{run.subject}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatDate(run.createdAt)}</div>
                </button>
              );
            })}
          </div>

          {selectedRun && (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", margin: 0 }}>{selectedRun.subject}</h3>
                  <p style={{ fontSize: 12, color: "#64748b", marginTop: 5, marginBottom: 0 }}>
                    Lancee le {formatDate(selectedRun.createdAt)} - Reply-to {selectedRun.replyTo}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["interrupted", "paused"].includes(selectedRun.status) && selectedRun.canResume && (
                    <Btn size="sm" onClick={() => resumeRun(selectedRun.id)} loading={resuming}>Reprendre</Btn>
                  )}
                  {selectedRun.status === "running" && (
                    <>
                      <Btn variant="ghost" size="sm" onClick={() => controlRun(selectedRun.id, "pause")} loading={controlling}>Pause</Btn>
                      <Btn variant="danger" size="sm" onClick={() => controlRun(selectedRun.id, "stop")} loading={controlling}>Stop</Btn>
                    </>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => loadRun(selectedRun.id)}>Actualiser</Btn>
                </div>
              </div>

              {["interrupted", "paused"].includes(selectedRun.status) && !selectedRun.canResume && (
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: 10, color: "#9a3412", fontSize: 12, marginBottom: 12 }}>
                  Cette ancienne campagne ne peut pas etre reprise automatiquement, car elle a ete lancee avant la sauvegarde de la liste et du contenu HTML.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Statut</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedRun.status}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Envoyes</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedRun.sent || 0} / {selectedRun.total || 0}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Erreurs</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: selectedRun.errors ? "#dc2626" : "#15803d" }}>{selectedRun.errors || 0}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Progression</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{pct}%</div>
                </div>
              </div>

              <div style={{ background: "#e2e8f0", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", background: selectedRun.status === "done" ? "#10b981" : "#7c3aed", width: `${pct}%`, transition: "width .4s ease" }} />
              </div>

              {selectedRun.currentEmail && (
                <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  En cours : <strong>{selectedRun.currentEmail}</strong> via <strong>{selectedRun.currentSender}</strong>
                </p>
              )}

              <H2 mt={18}>Derniers evenements</H2>
              {!events.length ? (
                <p style={{ color: "#94a3b8", fontSize: 13 }}>Aucun evenement enregistre.</p>
              ) : (
                <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                  {events.map(ev => (
                    <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "80px minmax(0, 1fr) 170px 120px", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                      <strong style={{ color: ev.type === "error" ? "#dc2626" : "#15803d" }}>{ev.type}</strong>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.email || ev.message || ""}</span>
                      <span style={{ color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.sender || ""}</span>
                      <span style={{ color: "#94a3b8" }}>{formatDate(ev.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabHistoriqueLegacy() {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#15803d", marginBottom: 10 }}>📩 Lire les réponses à vos campagnes</h3>
        <p style={{ fontSize: 14, color: "#166534", lineHeight: 1.8 }}>
          Les réponses de vos prospects arrivent directement dans la boîte mail de l'adresse <strong>Reply-to</strong> que tu configures dans chaque campagne.<br /><br />
          Si tu mets <code>equipe@colocrew.com</code> comme reply-to → tu les reçois dans cette boîte.<br />
          Si tu mets <code>dreyer.wil@gmail.com</code> → tu les reçois sur Gmail.
        </p>
      </div>
      <div style={{ marginTop: 16, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>📊 Suivi des envois</h3>
        <p style={{ fontSize: 14, color: "#1e40af", lineHeight: 1.7 }}>
          Les statistiques d'ouverture et de clics sont visibles directement dans ton compte Brevo (tableau de bord Brevo en ligne), dans la section <strong>Transactionnel → Logs d'emails</strong>.
        </p>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Campagnes() {
  const { showToast } = useToast();
  const [tab,   setTab]   = useState("contacts");
  const [lists, setLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const r = await fetch("/api/brevo/lists").then(r => r.json());
      setLists(r.lists || []);
    } catch {
      showToast("Impossible de charger les listes", "error");
    }
    setLoadingLists(false);
  }, [showToast]);

  useEffect(() => { loadLists(); }, [loadLists]);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ padding: "24px 32px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Campagnes email</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          Prospection par email · SMTP Brevo · 4 expéditeurs @colocrew.com · domaine vérifié
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e2e8f0", marginBottom: 30, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "9px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
              color: tab === t.key ? "#7c3aed" : "#64748b",
              borderBottom: `2px solid ${tab === t.key ? "#7c3aed" : "transparent"}`,
              marginBottom: -2,
            }}>{t.label}</button>
          ))}
        </div>

        {loadingLists ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#94a3b8", fontSize: 14 }}>
            <span style={{ width: 16, height: 16, border: "2px solid #e2e8f0", borderTopColor: "#7c3aed", borderRadius: "50%", display: "inline-block", animation: "spin .6s linear infinite" }} />
            Chargement…
          </div>
        ) : (
          <>
            {tab === "contacts"   && <TabContacts lists={lists} setLists={setLists} />}
            {tab === "campagne"   && <TabCampagne lists={lists} />}
            {tab === "acompte18"  && <TabAcompte18Juin />}
            {tab === "historique" && <TabHistoriqueFirebase />}
          </>
        )}
      </div>
    </>
  );
}
