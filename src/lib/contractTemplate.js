// Génère le HTML complet d'un Contrat d'Engagement Éducatif (CEE)
// à partir des données d'un membre et d'un contrat Firestore.
//
// Usage: openContractPrint(member, contract)

function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function contractInputLine(value, anchor, minWidth = 180) {
  const content = String(value || "").trim() ? `<strong>${esc(value)}</strong>` : "&nbsp;";
  return `<span class="cc-fill cc-contract-input" style="min-width:${minWidth}px"><span class="cc-field-anchor">${anchor}</span>${content}</span>`;
}

function frDate(isoOrSlash) {
  if (!isoOrSlash) return "___________";
  // Accepte "YYYY-MM-DD" ou "DD/MM/YYYY"
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrSlash)) {
    const [y, m, d] = isoOrSlash.split("-");
    return `${d}/${m}/${y}`;
  }
  return isoOrSlash;
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000) + 1;
}

const CONTRACT_ROLE_LABELS = {
  benevole: "Benevole",
  ds: "Directeur·rice",
  dsa: "Adjoint·e de direction",
  bafa: "Animateur·rice",
  "as-sb": "Assistant·e sanitaire / Surveillant·e de baignade",
  stagiaire: "Animateur·rice stagiaire / sans diplôme",
};

function contractRoleKey(contract) {
  const key = String(contract?.roleKey || "").trim().toLowerCase();
  if (CONTRACT_ROLE_LABELS[key]) return key;
  const role = String(contract?.role || "").trim().toLowerCase().replace(/\s+/g, "");
  if (role.includes("benevol") || role.includes("bÃ©nÃ©vol")) return "benevole";
  if (role === "ds") return "ds";
  if (role === "dsa") return "dsa";
  if (role === "bafa") return "bafa";
  if (role === "as/sb") return "as-sb";
  if (role.includes("stagiaire") || role.includes("sansdiplôme") || role.includes("ssdiplôme")) {
    return "stagiaire";
  }
  return "";
}

function contractRoleLabel(contract) {
  const key = contractRoleKey(contract);
  if (CONTRACT_ROLE_LABELS[key]) return CONTRACT_ROLE_LABELS[key];
  return contract?.role || "Animateur·rice";
}

function isVolunteerContract(contract) {
  return contractRoleKey(contract) === "benevole";
}

function exercisePlace(contract) {
  const stay = String(contract?.stayCode || contract?.stayName || "").toLowerCase();
  return stay.includes("mcsc") || stay.includes("creative surf") ? "Messanges" : "Bidarray";
}

function compensatoryRest(contractDays) {
  if (!contractDays) return null;
  const totalHours = contractDays * 11;
  const fullWeeks = Math.floor(contractDays / 7);
  const remainingDays = contractDays % 7;
  const minimumDuringByRemainder = { 4: 8, 5: 12, 6: 16 };
  const minimumDuringHours = fullWeeks * 16 + (minimumDuringByRemainder[remainingDays] || 0);
  return {
    totalHours,
    minimumDuringHours,
    afterStayHours: totalHours - minimumDuringHours,
  };
}

function formatEuro(value) {
  if (value == null || value === "") return "___________";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "___________";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount);
}

const DEFAULT_PRIME_NET = 60;
const DEFAULT_PRIME_GROSS = 81;

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function positiveNumber(value, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(amount, 0) : fallback;
}

function remunerationBreakdown(contract) {
  const primeCount = positiveNumber(contract?.primeCount, 0);
  const primeUnitNet = positiveNumber(contract?.primeUnitNet ?? contract?.primeNetUnit, DEFAULT_PRIME_NET);
  const primeUnitGross = positiveNumber(contract?.primeUnitGross ?? contract?.primeGrossUnit, DEFAULT_PRIME_GROSS);
  const totalNet = Number(contract?.netSalary);
  const totalGross = Number(contract?.grossSalary);
  const hasNet = Number.isFinite(totalNet);
  const hasGross = Number.isFinite(totalGross);
  const primeNet = round2(primeCount * primeUnitNet);
  const primeGross = round2(primeCount * primeUnitGross);
  const baseNet = hasNet ? Math.max(round2(totalNet - primeNet), 0) : null;
  const baseGross = hasGross ? Math.max(round2(totalGross - primeGross), 0) : null;

  return {
    primeCount,
    primeUnitNet,
    primeUnitGross,
    primeNet,
    primeGross,
    baseNet,
    baseGross,
    totalNet: hasNet ? totalNet : null,
    totalGross: hasGross ? totalGross : null,
  };
}

function remunerationTable(contract) {
  const b = remunerationBreakdown(contract);
  const primeLabel = b.primeCount > 0
    ? `${b.primeCount} x ${formatEuro(b.primeUnitNet)} net`
    : "Aucune prime";

  return `
    <table class="cc-remuneration-table">
      <thead>
        <tr>
          <th>Élément</th>
          <th>Net</th>
          <th>Brut</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Salaire de base</td>
          <td><strong>${formatEuro(b.baseNet)}</strong></td>
          <td>${formatEuro(b.baseGross)}</td>
        </tr>
        <tr>
          <td>Prime d'ancienneté <span>${esc(primeLabel)}</span></td>
          <td><strong>${formatEuro(b.primeNet)}</strong></td>
          <td>${formatEuro(b.primeGross)}</td>
        </tr>
        <tr class="cc-remuneration-total">
          <td>Total prévu</td>
          <td><strong>${formatEuro(b.totalNet)}</strong></td>
          <td>${formatEuro(b.totalGross)}</td>
        </tr>
      </tbody>
    </table>`;
}

function generateVolunteerContractHTML(member, contract) {
  const m = member || {};
  const c = contract || {};
  const fullName = esc(`${m.firstName || ""} ${m.lastName || ""}`.trim()) || "___________";
  const address = contractInputLine(m.address, "/cc-field-address/", 300);
  const phone = contractInputLine(m.phone, "/cc-field-phone/", 180);
  const email = contractInputLine(m.email, "/cc-field-email/", 240);
  const birthDate = contractInputLine(m.dateOfBirth, "/cc-field-birth-date/", 120);
  const birthPlace = contractInputLine(m.birthPlace, "/cc-field-birth-place/", 200);
  const nationality = contractInputLine(m.nationality, "/cc-field-nationality/", 150);
  const startFr = frDate(c.startDate);
  const endFr = frDate(c.endDate);
  const lieuExercice = esc(exercisePlace(c));
  const stayLabel = esc([c.stayName || c.stayCode, c.week].filter(Boolean).join(" - "));
  const today = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Convention benevole - ${fullName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; background: #fff; }
  @page { margin: 18mm 20mm; }
  .page { max-width: 700px; margin: 0 auto; padding: 30px 20px 40px; }
  .cc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #c41e6c; }
  .cc-logo-text { font-size: 22pt; font-weight: 900; color: #2d1560; letter-spacing: -0.5px; }
  .cc-tagline { font-size: 8pt; color: #c41e6c; font-style: italic; margin-top: 2px; }
  .cc-contact { text-align: right; font-size: 8pt; color: #555; line-height: 1.6; }
  .cc-title { text-align: center; font-size: 16pt; font-weight: bold; text-decoration: underline; margin: 28px 0 24px; }
  .cc-party-block p, .cc-article p { line-height: 1.6; margin-bottom: 6px; }
  .cc-article { margin-bottom: 18px; }
  .cc-article h2 { font-size: 11pt; font-weight: bold; margin-bottom: 8px; text-decoration: underline; }
  .cc-article ul { margin: 6px 0 6px 22px; }
  .cc-article li { margin-bottom: 5px; line-height: 1.5; }
  .cc-fill { border-bottom: 1px solid #555; display: inline-block; min-width: 120px; }
  .cc-contract-input { min-height: 18px; vertical-align: bottom; position: relative; padding: 0 3px 1px; }
  .cc-field-anchor, .cc-docusign-anchor { color: #fff; font-size: 1px; line-height: 1px; user-select: none; }
  .cc-signatures { margin-top: 32px; }
  .cc-sign-place { margin-bottom: 16px; }
  .cc-sign-row { display: flex; justify-content: space-between; margin-top: 30px; gap: 40px; }
  .cc-sign-box { flex: 1; }
  .cc-sign-box p { font-weight: bold; margin-bottom: 95px; }
  .cc-footer { margin-top: 40px; padding-top: 10px; border-top: 1.5px solid #c41e6c; text-align: center; font-size: 8pt; color: #888; line-height: 1.6; }
  .no-print { position: fixed; top: 16px; right: 16px; z-index: 999; }
  .btn-print { background: #7c3aed; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 700; cursor: pointer; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="no-print"><button class="btn-print" onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="page">
  <div class="cc-header">
    <div><div class="cc-logo-text">ColoCrew</div><div class="cc-tagline">reinventons les colos !</div></div>
    <div class="cc-contact">info@colocrew.com - 01 84 21 02 30<br>colocrew.com</div>
  </div>

  <div class="cc-title">Convention de benevolat</div>

  <div class="cc-article">
    <p><strong>Entre l'association ColoCrew</strong>, 1 rue Magenta - 93500 Pantin, representee par Monsieur Dreyer William,</p>
    <p><strong>Et le/la benevole :</strong> ${fullName}</p>
    <div class="cc-party-block">
      <p>Adresse : ${address}</p>
      <p>Telephone : ${phone}</p>
      <p>Email : ${email}</p>
      <p>Date de naissance : ${birthDate}</p>
      <p>Lieu de naissance : ${birthPlace}</p>
      <p>Nationalite : ${nationality}</p>
    </div>
  </div>

  <div class="cc-article">
    <h2>Article 1 - Objet</h2>
    <p>La presente convention precise les conditions dans lesquelles le/la benevole participe, sans lien de subordination salariee et sans remuneration, aux activites organisees par ColoCrew.</p>
  </div>

  <div class="cc-article">
    <h2>Article 2 - Mission et periode</h2>
    <p>Le/la benevole intervient du <strong>${startFr}</strong> au <strong>${endFr}</strong>, dans le cadre du sejour <strong>${stayLabel || "___________"}</strong>, principalement a <strong>${lieuExercice}</strong>.</p>
    <p>Ses missions peuvent inclure l'appui logistique, l'accompagnement de la vie collective, l'aide aux activites et tout soutien utile a l'equipe, dans le respect du projet educatif et des consignes de securite.</p>
  </div>

  <div class="cc-article">
    <h2>Article 3 - Absence de remuneration</h2>
    <p>Cette participation est effectuee a titre benevole. Elle ne donne lieu a aucun salaire, prime ou contrepartie financiere. Les frais eventuellement engages ne peuvent etre rembourses que sur accord prealable de ColoCrew et sur presentation de justificatifs.</p>
  </div>

  <div class="cc-article">
    <h2>Article 4 - Engagements du/de la benevole</h2>
    <ul>
      <li>Respecter les regles de fonctionnement, de securite, d'hygiene et de confidentialite de ColoCrew ;</li>
      <li>Adopter une posture bienveillante et adaptee a l'accueil collectif de mineurs ;</li>
      <li>Signaler sans delai tout incident ou difficulte a la direction du sejour ;</li>
      <li>Ne pas se substituer aux responsabilites legales de l'equipe de direction.</li>
    </ul>
  </div>

  <div class="cc-article">
    <h2>Article 5 - Assurance et responsabilite</h2>
    <p>ColoCrew declare disposer d'une assurance responsabilite civile pour ses activites. Le/la benevole s'engage a informer l'association de toute situation personnelle susceptible d'affecter sa participation.</p>
  </div>

  <div class="cc-article">
    <h2>Article 6 - Fin de la convention</h2>
    <p>La presente convention peut prendre fin a tout moment, a l'initiative du/de la benevole ou de ColoCrew, notamment en cas d'impossibilite de poursuivre la mission ou de non-respect des regles applicables.</p>
  </div>

  <div class="cc-signatures">
    <p class="cc-sign-place">Fait a Pantin, le ${today}</p>
    <p><strong>Signatures :</strong></p>
    <div class="cc-sign-row">
      <div class="cc-sign-box"><p>Pour ColoCrew :<br><span class="cc-docusign-anchor">/cc-organizer-signature/</span></p></div>
      <div class="cc-sign-box"><p>Pour le/la benevole :<br><span class="cc-docusign-anchor">/cc-staff-signature/</span></p></div>
    </div>
  </div>

  <div class="cc-footer"><strong>Association ColoCrew</strong> - SIRET : 9 3 2 1 7 1 4 3 2 0 0 0 1 0</div>
</div>
</body>
</html>`;
}

export function generateContractHTML(member, contract) {
  if (isVolunteerContract(contract)) return generateVolunteerContractHTML(member, contract);

  const m = member   || {};
  const c = contract || {};

  const fullName    = esc(`${m.firstName || ""} ${m.lastName || ""}`.trim()) || "___________";
  const address     = contractInputLine(m.address, "/cc-field-address/", 300);
  const phone       = contractInputLine(m.phone, "/cc-field-phone/", 180);
  const email       = contractInputLine(m.email, "/cc-field-email/", 240);
  const secu        = contractInputLine(m.socialSecurityNumber, "/cc-field-social-security/", 230);
  const birthDate   = contractInputLine(m.dateOfBirth, "/cc-field-birth-date/", 120);
  const birthPlace  = contractInputLine(m.birthPlace, "/cc-field-birth-place/", 200);
  const nationality = contractInputLine(m.nationality, "/cc-field-nationality/", 150);
  const roleKey     = contractRoleKey(c);
  const poste       = esc(contractRoleLabel(c));
  const lieuExercice = esc(exercisePlace(c));
  const authority = roleKey === "ds"
    ? "sous l'autorité de l'organisateur et de son représentant"
    : "sous l'autorité directe du·de la Directeur·rice du séjour";
  const asSbMissionArticles = roleKey === "as-sb" ? `
  <!-- Article 8 -->
  <div class="cc-article">
    <h2>Article 8 – Missions de l'Assistant·e Sanitaire (AS)</h2>
    <p>L'Assistant·e Sanitaire est chargé·e de :</p>
    <ol>
      <li><span class="cc-bold">Prévention et soins</span> : contrôler l'état de santé initial des mineur·e·s, dispenser les soins courants (pansements, petits soins) et gérer le stock de matériel sanitaire ;</li>
      <li><span class="cc-bold">Suivi sanitaire</span> : tenir quotidiennement le registre d'infirmerie et de traitement, s'assurer du stock et du bon état des trousses sanitaires ;</li>
      <li><span class="cc-bold">Premiers secours</span> : intervenir en cas d'accident ou malaise, appliquer les protocoles PSC1 et assurer le lien avec les secours externes si nécessaire ;</li>
      <li><span class="cc-bold">Prévention</span> : organiser, le cas échéant, des séances de prévention auprès des mineurs.</li>
    </ol>
  </div>

  <!-- Article 9 -->
  <div class="cc-article">
    <h2>Article 9 – Missions du·de la Surveillant·e de Baignade (SB)</h2>
    <p>Le·la Surveillant·e de Baignade assure :</p>
    <ol>
      <li><span class="cc-bold">Organisation des baignades</span> : organiser les baignades conformément à la réglementation applicable ;</li>
      <li><span class="cc-bold">Vigilance continue</span> : surveiller attentivement la baignade ;</li>
      <li><span class="cc-bold">Sécurité aquatique</span> : connaître et appliquer les protocoles de sauvetage et de premiers secours ;</li>
      <li><span class="cc-bold">Sensibilisation</span> : rappeler aux participant·e·s les consignes de sécurité.</li>
    </ol>
  </div>` : "";
  const deputyMissionArticle = roleKey === "dsa" ? `
  <!-- Article 8 -->
  <div class="cc-article">
    <h2>Article 8 – Missions de l'Adjoint·e de direction</h2>
    <p>L'Adjoint·e de direction est membre à part entière de l'équipe de direction. À ce titre, il·elle exerce les responsabilités suivantes :</p>
    <ol>
      <li><span class="cc-bold">Pilotage du séjour</span> : l'Adjoint·e participe aux décisions de direction, à la mise en œuvre du projet pédagogique et à l'organisation générale du séjour ;</li>
      <li><span class="cc-bold">Management de l'équipe</span> : il·elle encadre l'équipe d'animation, anime les réunions, répartit les responsabilités et veille au bon déroulement des missions ;</li>
      <li><span class="cc-bold">Sécurité et réglementation</span> : il·elle veille à la sécurité des mineur·e·s, au respect de la réglementation et à la tenue des documents obligatoires ;</li>
      <li><span class="cc-bold">Direction opérationnelle</span> : il·elle gère le fonctionnement quotidien et assure la continuité de la direction en l'absence du·de la Directeur·rice ;</li>
      <li><span class="cc-bold">Communication et suivi</span> : il·elle représente la direction auprès des familles et partenaires, suit les incidents et participe au bilan du séjour.</li>
    </ol>
  </div>` : "";
  const ruptureArticleNumber = roleKey === "as-sb" ? 10 : roleKey === "dsa" ? 9 : 8;
  const miscellaneousArticleNumber = ruptureArticleNumber + 1;

  const startFr  = frDate(c.startDate);
  const endFr    = frDate(c.endDate);
  const nbJours  = daysBetween(c.startDate, c.endDate);
  const nbJoursLabel = nbJours || "___";
  const repos = compensatoryRest(nbJours);
  const netSalary = formatEuro(c.netSalary);
  const netPerDay = nbJours ? formatEuro(Number(c.netSalary) / nbJours) : "___________";
  const remunerationDetails = remunerationTable(c);

  const today = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>CEE — ${fullName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    color: #111;
    background: #fff;
    padding: 0;
  }
  @page { margin: 18mm 20mm; }

  .page { max-width: 700px; margin: 0 auto; padding: 30px 20px 40px; }

  /* ── En-tête ── */
  .cc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 2px solid #c41e6c;
  }
  .cc-logo-block .cc-logo-text {
    font-size: 22pt;
    font-weight: 900;
    color: #2d1560;
    letter-spacing: -0.5px;
  }
  .cc-logo-block .cc-tagline {
    font-size: 8pt;
    color: #c41e6c;
    font-style: italic;
    margin-top: 2px;
  }
  .cc-contact {
    text-align: right;
    font-size: 8pt;
    color: #555;
    line-height: 1.6;
  }
  .cc-contact a { color: #c41e6c; text-decoration: none; }

  /* ── Titre ── */
  .cc-title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 28px 0 24px;
  }

  /* ── Parties ── */
  .cc-parties { margin-bottom: 24px; line-height: 1.7; }
  .cc-party-intro { font-weight: bold; margin-bottom: 8px; }
  .cc-party-block p { margin: 1px 0; font-size: 10pt; }
  .cc-party-block strong { font-weight: bold; }
  .cc-designation { font-style: italic; margin-top: 6px; }
  .cc-dune-part { text-align: right; font-weight: bold; margin: 10px 0 16px; }
  .cc-convention { margin-top: 12px; margin-bottom: 20px; }

  /* ── Articles ── */
  .cc-article { margin-bottom: 18px; }
  .cc-article h2 {
    font-size: 11pt;
    font-weight: bold;
    margin-bottom: 8px;
    text-decoration: underline;
  }
  .cc-article p { line-height: 1.6; margin-bottom: 6px; }
  .cc-article ol { margin: 6px 0 6px 22px; }
  .cc-article ol li { margin-bottom: 5px; line-height: 1.5; }
  .cc-article ul { margin: 6px 0 6px 22px; list-style: disc; }
  .cc-article ul li { margin-bottom: 4px; line-height: 1.5; }
  .cc-remuneration-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 9.5pt;
  }
  .cc-remuneration-table th,
  .cc-remuneration-table td {
    border: 1px solid #bbb;
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  .cc-remuneration-table th {
    background: #f4f0ff;
    color: #2d1560;
  }
  .cc-remuneration-table span {
    display: block;
    margin-top: 2px;
    color: #555;
    font-size: 8pt;
  }
  .cc-remuneration-total td {
    background: #fafafa;
    font-weight: bold;
  }
  .cc-bold { font-weight: bold; }
  .cc-fill { border-bottom: 1px solid #555; display: inline-block; min-width: 120px; }
  .cc-contract-input {
    min-height: 18px;
    vertical-align: bottom;
    position: relative;
    padding: 0 3px 1px;
  }
  .cc-field-anchor {
    color: #fff;
    font-size: 1px;
    line-height: 1px;
    user-select: none;
  }

  /* ── Signatures ── */
  .cc-signatures { margin-top: 32px; }
  .cc-sign-place { margin-bottom: 16px; }
  .cc-sign-row {
    display: flex;
    justify-content: space-between;
    margin-top: 30px;
    gap: 40px;
  }
  .cc-sign-box { flex: 1; }
  .cc-sign-box p { font-weight: bold; margin-bottom: 95px; }
  .cc-docusign-anchor {
    color: #fff;
    font-size: 1px;
    line-height: 1px;
    user-select: none;
  }

  /* ── Footer ── */
  .cc-footer {
    margin-top: 40px;
    padding-top: 10px;
    border-top: 1.5px solid #c41e6c;
    text-align: center;
    font-size: 8pt;
    color: #888;
    line-height: 1.6;
  }
  .cc-footer strong { color: #2d1560; }

  /* ── Bouton imprimer (masqué à l'impression) ── */
  .no-print {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 999;
  }
  .btn-print {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(124,58,237,0.35);
  }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
</div>

<div class="page">

  <!-- En-tête -->
  <div class="cc-header">
    <div class="cc-logo-block">
      <div class="cc-logo-text">ColoCrew</div>
      <div class="cc-tagline">réinventons les colos !</div>
    </div>
    <div class="cc-contact">
      info@colocrew.com · 01 84 21 02 30<br>
      colocrew.com
    </div>
  </div>

  <!-- Titre -->
  <div class="cc-title">Contrat d'engagement éducatif (CEE)</div>

  <!-- Parties -->
  <div class="cc-parties">
    <p class="cc-party-intro">Entre les soussignés :</p>

    <div class="cc-party-block">
      <p><strong>ColoCrew</strong>, 1 rue Magenta - 93500 Pantin, représenté par Monsieur Dreyer William,<br>
      en qualité de Secrétaire Général.</p>
    </div>
    <p class="cc-designation"><em>Ci-après dénommé «ColoCrew »</em></p>
    <p class="cc-dune-part">D'une part</p>

    <p>Et,</p><br>

    <div class="cc-party-block">
      <p>Monsieur/Madame (Nom, Prénom) : <strong>${fullName}</strong></p>
      <p>Adresse : ${address}</p>
      <p>Téléphone : ${phone}</p>
      <p>Email : ${email}</p>
      <p>Numéro de Sécurité sociale : ${secu}</p>
      <p>Date de naissance : ${birthDate}</p>
      <p>Lieu de naissance : ${birthPlace}</p>
      <p>Nationalité : ${nationality}</p>
      <p>Poste : <strong>${poste}</strong></p>
    </div>
    <p class="cc-designation"><em>Ci-après dénommé·e « ${poste} »</em></p>
    <p class="cc-dune-part">D'autre part</p>

    <p class="cc-convention">Il a été convenu des articles suivants :</p>
  </div>

  <!-- Article 1 -->
  <div class="cc-article">
    <h2>Article 1 – Objet du contrat</h2>
    <p>Le présent contrat a pour objet l'exercice, à titre occasionnel, des fonctions
    de <strong>${poste}</strong> au sein d'un Accueil Collectif de Mineurs (colonie de vacances)
    organisé par ColoCrew.</p>
  </div>

  <!-- Article 2 -->
  <div class="cc-article">
    <h2>Article 2 – Missions détaillées</h2>
    <p>Le·la <strong>${poste}</strong> exercera les missions principales suivantes, sans que cette liste ne soit limitative :</p>
    <ol>
      <li><span class="cc-bold">Sécurité et bien-être</span> : assurer la sécurité des mineurs et veiller au respect des protocoles d'hygiène et de sécurité ;</li>
      <li><span class="cc-bold">Projet pédagogique</span> : participer à l'élaboration et à l'animation des activités en s'appuyant sur le projet pédagogique ;</li>
      <li><span class="cc-bold">Encadrement</span> : organiser la vie quotidienne et accompagner les mineurs lors des déplacements ;</li>
      <li><span class="cc-bold">Communication</span> : informer les familles et gérer les incidents ;</li>
      <li><span class="cc-bold">Travail en équipe</span> : participer aux réunions et aux préparations de groupe ;</li>
      <li><span class="cc-bold">Situations d'urgence</span> : appliquer les procédures d'urgence ;</li>
      <li><span class="cc-bold">Suivre les directives de sa hiérarchie.</span></li>
    </ol>
    <p>Le·la <strong>${poste}</strong> s'engage à respecter les lois et règlements des séjours de vacances et des séjours
    spécifiques définis par les ministères de tutelle ainsi que les instructions et directives de ColoCrew
    concernant l'organisation du séjour. Il·elle exercera ses fonctions ${authority}.</p>
  </div>

  <!-- Article 3 -->
  <div class="cc-article">
    <h2>Article 3 – Durée, période d'essai et lieu</h2>
    <ol>
      <li>Du <strong>${startFr}</strong> au <strong>${endFr}</strong> inclus, pour un total de <strong>${nbJoursLabel}</strong> jours.</li>
      <li>Période d'essai de deux (2) jours ouvrés : résiliation possible sans préavis ni indemnité.</li>
      <li>Le présent contrat est établi à <strong>Pantin</strong>. Le lieu principal d'exercice est situé à <strong>${lieuExercice}</strong>. Le·la salarié·e pourra également intervenir dans d'autres lieux, notamment lors des convoyages et des sorties.</li>
      <li>Si l'animateur·rice est amené.e, dans le cadre de ses fonctions, à effectuer un convoyage nécessitant un déplacement à J-1 ou J+1, son salaire se verra augmenté de l'équivalent d'un jour de salaire.</li>
    </ol>
  </div>

  <!-- Article 4 -->
  <div class="cc-article">
    <h2>Article 4 – Temps de travail, repos et repos compensateur</h2>
    <ol>
      <li><span class="cc-bold">Durée de travail hebdomadaire :</span><br>
        Maximum 48 heures par semaine sur 6 mois glissants (article L. 962‑4 CASF).</li>
      <li><span class="cc-bold">Repos hebdomadaire :</span><br>
        24 heures consécutives minimum par période de 7 jours.</li>
      <li><span class="cc-bold">Repos quotidien :</span><br>
        Le <strong>repos quotidien est supprimé</strong>, et le·la salarié·e bénéficie d'un repos compensateur correspondant au déficit (voir 5).</li>
      <li><span class="cc-bold">Heures de nuit :</span><br>
        Les périodes de nuit durant lesquelles le·la <strong>${poste}</strong> reste en poste ou peut être appelé·e sont comptabilisées comme temps de travail effectif.</li>
      <li><span class="cc-bold">Repos compensateur :</span><br>
        Le présent contrat porte sur <strong>${nbJoursLabel} jours</strong> d'engagement.
        ${repos
          ? `En cas de suppression complète du repos quotidien, le repos compensateur est de <strong>${repos.totalHours} heures</strong> au total. Un minimum de <strong>${repos.minimumDuringHours} heures</strong> est accordé pendant le séjour et le solde de <strong>${repos.afterStayHours} heures</strong> à son issue.`
          : "La durée du repos compensateur sera calculée à partir des dates définitives du contrat."}</li>
    </ol>
  </div>

  <!-- Article 5 -->
  <div class="cc-article">
    <h2>Article 5 – Rémunération</h2>
    ${remunerationDetails}
    <ol>
      <li>Rémunération nette totale prévue pour le contrat : <strong>${netSalary}</strong>.</li>
      <li>Rémunération nette moyenne par jour d'engagement : <strong>${netPerDay}</strong>.</li>
      <li>Paiement par virement au plus tard le 5 du mois suivant.</li>
    </ol>
  </div>

  <!-- Article 6 -->
  <div class="cc-article">
    <h2>Article 6 – Frais</h2>
    <p>Si dans le cadre de ses missions, l'animateur·rice est amené à avancer des frais pour lui ou pour des mineurs,
    ColoCrew s'engage à lui rembourser uniquement si un accord préalable a eu lieu avec sa direction et sur présentation des justificatifs.</p>
    <p>Les frais de déplacement des voyages aller et retour de son domicile habituel au lieu de prise en charge des participants,
    seront remboursés sur justificatifs. Il (elle) sera responsable des enfants dès leur prise en charge et ce jusqu'au retour,
    quels que soient les lieux de départ ou de retour.</p>
  </div>

  <!-- Article 7 -->
  <div class="cc-article">
    <h2>Article 7 – Protection sociale et assurances</h2>
    <p>ColoCrew déclare le·la <strong>${poste}</strong> auprès des organismes sociaux compétents et souscrit une assurance responsabilité civile et accidents corporels.</p>
  </div>

  ${asSbMissionArticles}
  ${deputyMissionArticle}

  <!-- Article ${ruptureArticleNumber} -->
  <div class="cc-article">
    <h2>Article ${ruptureArticleNumber} – Rupture du CEE</h2>
    <p>Le contrat peut être rompu de plein droit en cas de force majeure, faute grave, impossibilité pour l'intéressé.e de continuer à exercer ses fonctions.</p>
    <p>L'annulation provisoire ou définitive d'un séjour pour raison de force majeure entraîne la rupture du présent contrat ipso facto et sans appel.</p>
  </div>

  <!-- Article ${miscellaneousArticleNumber} -->
  <div class="cc-article">
    <h2>Article ${miscellaneousArticleNumber} – Dispositions diverses</h2>
    <p>L'intéressé.e certifie sur l'honneur respecter les conditions définies aux articles D.432-1 et L.432-4 du Code de l'action sociale et des familles permettant la conclusion d'un contrat d'engagement éducatif. Il (elle) s'engage à faire connaître à ColoCrew, dans les plus brefs délais, tout changement dans sa situation personnelle, en particulier si ce changement rendait impossible l'application du statut de l'engagement éducatif.</p>
    <p>L'intéressé.e certifie sur l'honneur l'exactitude et la sincérité des informations mentionnées dans ce contrat concernant ses formations, ses stages, ses qualifications et ses diplômes. Le présent contrat devient automatiquement caduc s'il s'avère que l'intéressé.e a été engagé.e pour une qualification qu'il/elle ne possède pas réellement.</p>
    <p>L'intéressé.e certifie par ailleurs n'avoir encouru aucune condamnation pour crime ou délit contraire à la probité et aux bonnes mœurs, n'être pas frappé.e de l'interdiction d'enseigner ou de participer à la direction et à l'encadrement d'institutions ou d'organismes de vacances et de loisirs pour les mineurs.</p>
  </div>

  <!-- Signatures -->
  <div class="cc-signatures">
    <p class="cc-sign-place">Fait à Pantin, le ${today}</p>
    <p><strong>Signatures :</strong></p>
    <div class="cc-sign-row">
      <div class="cc-sign-box">
        <p>• Pour l'Organisateur :<br><span class="cc-docusign-anchor">/cc-organizer-signature/</span></p>
      </div>
      <div class="cc-sign-box">
        <p>• Pour le·la ${poste} :<br><span class="cc-docusign-anchor">/cc-staff-signature/</span></p>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="cc-footer">
    <strong>Association ColoCrew</strong> — SIRET : 9 3 2 1 7 1 4 3 2 0 0 0 1 0<br>
    Suivez-nous sur les réseaux : @_colocrew / ColoCrew
  </div>

</div>
</body>
</html>`;
}

export function openContractPrint(member, contract) {
  const label = `${member?.firstName || ""}-${member?.lastName || ""}`.trim().replace(/\s+/g, "-") || "contrat-individuel";
  openContractsBatchPrint([{ member, contract }], label);
}

export function openContractsBatchPrint(entries, label = "séjour") {
  const validEntries = (entries || []).filter((entry) => entry?.member && entry?.contract);
  if (!validEntries.length) return;

  const documents = validEntries.map(({ member, contract }) => {
    const parsed = new DOMParser().parseFromString(generateContractHTML(member, contract), "text/html");
    const page = parsed.querySelector(".page");
    page?.querySelector(".cc-footer")?.remove();
    return page?.outerHTML || "";
  }).filter(Boolean);
  const firstDocument = new DOMParser().parseFromString(
    generateContractHTML(validEntries[0].member, validEntries[0].contract),
    "text/html",
  );
  const contractStyles = firstDocument.querySelector("style")?.textContent || "";
  const safeLabel = esc(label);
  const body = documents.map((documentHtml) => `<section class="batch-contract">${documentHtml}</section>`).join("");

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Contrats CEE groupés — ${safeLabel}</title>
  <style>
    ${contractStyles}
    .batch-toolbar{position:fixed;top:14px;right:14px;z-index:9999;display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);font-family:Arial,sans-serif}
    .batch-toolbar span{font-size:12px;color:#555}.batch-toolbar button{background:#7c3aed;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer}
    .batch-contract{break-before:recto;page-break-before:right;break-after:page;page-break-after:always}.batch-contract:first-of-type{break-before:auto;page-break-before:auto}
    @media print{
      @page{size:A4;margin:7mm 10mm}
      .no-print,.batch-toolbar{display:none!important}
      .batch-contract{break-before:recto;page-break-before:right;break-after:page;page-break-after:always}
      .batch-contract:first-of-type{break-before:auto;page-break-before:auto}
      .batch-contract .page{max-width:none;padding:4px 3px 6px;font-size:8.4pt}
      .batch-contract .cc-header{margin-bottom:8px;padding-bottom:5px}
      .batch-contract .cc-logo-block .cc-logo-text{font-size:18pt}
      .batch-contract .cc-contact{font-size:7pt;line-height:1.3}
      .batch-contract .cc-title{font-size:12.5pt;margin:9px 0 8px}
      .batch-contract .cc-parties{margin-bottom:7px;line-height:1.25}
      .batch-contract .cc-party-intro{margin-bottom:4px}
      .batch-contract .cc-party-block p{font-size:8.2pt;line-height:1.2}
      .batch-contract .cc-designation{margin-top:3px}
      .batch-contract .cc-dune-part{margin:3px 0 5px}
      .batch-contract .cc-convention{margin-top:4px;margin-bottom:6px}
      .batch-contract .cc-article{margin-bottom:6px;break-inside:auto;page-break-inside:auto}
      .batch-contract .cc-article h2{font-size:9pt;margin-bottom:2px}
      .batch-contract .cc-article p{font-size:8.2pt;line-height:1.2;margin-bottom:2px}
      .batch-contract .cc-article ol,.batch-contract .cc-article ul{margin:2px 0 2px 15px}
      .batch-contract .cc-article li{font-size:8.1pt!important;line-height:1.18!important;margin-bottom:1px!important}
      .batch-contract .cc-signatures{margin-top:9px;break-inside:avoid;page-break-inside:avoid}
      .batch-contract .cc-sign-place{margin-bottom:4px}
      .batch-contract .cc-sign-row{margin-top:7px;gap:20px}
      .batch-contract .cc-sign-box p{margin-bottom:20px}
    }
  </style></head><body>
    <div class="batch-toolbar"><span>${documents.length} contrat${documents.length > 1 ? "s" : ""} · impression recto-verso bord long</span><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
    ${body}
  </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank");
  if (!popup) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `Contrats-CEE-${String(label || "sejour").replace(/[^a-zA-Z0-9-]+/g, "-")}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    alert("Autorisez les popups pour ouvrir le PDF groupé directement.");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
