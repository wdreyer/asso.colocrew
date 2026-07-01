// Génère le HTML complet d'un Contrat d'Engagement Éducatif (CEE)
// à partir des données d'un membre et d'un contrat Firestore.
//
// Usage: openContractPrint(member, contract)

function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  if (!start || !end) return "___";
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (isNaN(a) || isNaN(b)) return "___";
  return Math.round((b - a) / 86400000) + 1;
}

export function generateContractHTML(member, contract) {
  const m = member   || {};
  const c = contract || {};

  const fullName    = esc(`${m.firstName || ""} ${m.lastName || ""}`.trim()) || "___________";
  const address     = esc(m.address || "___________");
  const phone       = esc(m.phone   || "___________");
  const email       = esc(m.email   || "___________");
  const secu        = esc(m.socialSecurityNumber || "___________");
  const dob         = esc([m.dateOfBirth, m.birthPlace].filter(Boolean).join(" à ") || "___________");
  const nationality = esc(m.nationality || "Française");
  const poste       = esc(c.role || "Animateur·rice");

  const startFr  = frDate(c.startDate);
  const endFr    = frDate(c.endDate);
  const nbJours  = daysBetween(c.startDate, c.endDate);

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
  .cc-bold { font-weight: bold; }
  .cc-fill { border-bottom: 1px solid #555; display: inline-block; min-width: 120px; }

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
  .cc-sign-box p { font-weight: bold; margin-bottom: 50px; }

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
      <p>Adresse : <strong>${address}</strong></p>
      <p>Téléphone : <strong>${phone}</strong></p>
      <p>Email : <strong>${email}</strong></p>
      <p>Numéro de Sécurité sociale : <strong>${secu}</strong></p>
      <p>Date et lieu de naissance : <strong>${dob}</strong></p>
      <p>Nationalité : <strong>${nationality}</strong></p>
      <p>Poste : <strong>${poste}</strong></p>
    </div>
    <p class="cc-designation"><em>Ci-après dénommé·e « l'Animateur·rice »</em></p>
    <p class="cc-dune-part">D'autre part</p>

    <p class="cc-convention">Il a été convenu des articles suivants :</p>
  </div>

  <!-- Article 1 -->
  <div class="cc-article">
    <h2>Article 1 – Objet du contrat</h2>
    <p>Le présent contrat a pour objet l'exercice, à titre occasionnel, des fonctions
    d'Animateur·rice au sein d'un Accueil Collectif de Mineurs (colonie de vacances)
    organisé par ColoCrew.</p>
  </div>

  <!-- Article 2 -->
  <div class="cc-article">
    <h2>Article 2 – Missions détaillées</h2>
    <p>L'Animateur·rice exercera les missions principales suivantes, sans que cette liste ne soit limitative :</p>
    <ol>
      <li><span class="cc-bold">Sécurité et bien-être</span> : assurer la sécurité des mineurs et veiller au respect des protocoles d'hygiène et de sécurité ;</li>
      <li><span class="cc-bold">Projet pédagogique</span> : participer à l'élaboration et à l'animation des activités en s'appuyant sur le projet pédagogique ;</li>
      <li><span class="cc-bold">Encadrement</span> : organiser la vie quotidienne et accompagner les mineurs lors des déplacements ;</li>
      <li><span class="cc-bold">Communication</span> : informer les familles et gérer les incidents ;</li>
      <li><span class="cc-bold">Travail en équipe</span> : participer aux réunions et aux préparations de groupe ;</li>
      <li><span class="cc-bold">Situations d'urgence</span> : appliquer les procédures d'urgence ;</li>
      <li><span class="cc-bold">Suivre les directives de sa hiérarchie.</span></li>
    </ol>
    <p>L'Animateur·rice s'engage à respecter les lois et règlements des séjours de vacances et des séjours
    spécifiques définis par les ministères de tutelle ainsi que les instructions et directives de ColoCrew
    concernant l'organisation du séjour. Il (elle) sera placé.e sous l'autorité directe du Directeur/Directrice de séjour.</p>
  </div>

  <!-- Article 3 -->
  <div class="cc-article">
    <h2>Article 3 – Durée, période d'essai et lieu</h2>
    <ol>
      <li>Du <strong>${startFr}</strong> au <strong>${endFr}</strong> inclus, pour un total de <strong>${nbJours}</strong> jours.</li>
      <li>Période d'essai de deux (2) jours ouvrés : résiliation possible sans préavis ni indemnité.</li>
      <li>L'animateur·rice exercera la plupart de ses missions au centre de Gravières (Bidart), mais pourra être amené à les exercer dans d'autres lieux et notamment lors des convoyages et des sorties.</li>
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
        Les périodes de nuit durant lesquelles l'Animateur·rice reste en poste ou peut être appelé·e sont comptabilisées comme temps de travail effectif.</li>
      <li><span class="cc-bold">Repos compensateur :</span><br>
        Pour un contrat d'engagement éducatif de 3 jours avec suppression du repos quotidien, le dispositif de l'article D. 432-3 du CASF prévoit les modalités suivantes.</li>
    </ol>
  </div>

  <!-- Article 5 -->
  <div class="cc-article">
    <h2>Article 5 – Rémunération</h2>
    <ol>
      <li>Indemnité journalière brute : <strong>51,09 €</strong> (4,3 × SMIC horaire) hors congés payés.</li>
      <li>Indemnité compensatrice de congés payés : 10 % = <strong>5,11 €</strong>.</li>
      <li>Total brut/jour : <strong>56,20 €</strong>.</li>
      <li>Primes SB : <strong>4,00 € brut/jour</strong>.</li>
      <li>Primes AS : <strong>4,00 € brut/jour</strong>.</li>
      <li>Prime de performance/occupation : à définir selon le taux de remplissage.</li>
      <li>Paiement : mensuel, par virement au plus tard le 5 du mois suivant.</li>
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
    <p>ColoCrew déclare l'Animateur·rice auprès des organismes sociaux compétents et souscrit une assurance responsabilité civile et accidents corporels.</p>
  </div>

  <!-- Article 8 -->
  <div class="cc-article">
    <h2>Article 8 – Missions de l'Assistant·e Sanitaire (AS)</h2>
    <p>L'Assistant·e Sanitaire est chargé·e de :</p>
    <ol>
      <li><span class="cc-bold">Prévention et soins</span> : contrôler l'état de santé initial des mineur·e·s, dispenser les soins courants (pansements, petits soins) et gérer le stock de matériel sanitaire ;</li>
      <li><span class="cc-bold">Suivi sanitaire</span> : tenir quotidiennement le registre d'infirmerie et de traitement, s'assurer du stock et du bon état des trousses sanitaires ;</li>
      <li><span class="cc-bold">Premiers secours</span> : intervenir en cas d'accident ou malaise, appliquer les protocoles PSC1 et assurer le lien avec les secours externes si nécessaire ;</li>
      <li><span class="cc-bold">Prévention</span> : Organiser le cas échéant des séances de prévention auprès des mineurs (conduites addictives, sexualité etc.).</li>
    </ol>
  </div>

  <!-- Article 9 -->
  <div class="cc-article">
    <h2>Article 9 – Missions du·de la Surveillant·e de Baignade (SB)</h2>
    <p>Le·la Surveillant·e de Baignade assure :</p>
    <ol>
      <li><span class="cc-bold">L'organisation des baignades</span> : en fonction du lieu, du type de baignade, organiser la baignade suivant la réglementation ;</li>
      <li><span class="cc-bold">Vigilance continue</span> : surveiller attentivement la baignade ;</li>
      <li><span class="cc-bold">Sécurité aquatique</span> : connaître et appliquer les protocoles de sauvetage et de premier secours ;</li>
      <li><span class="cc-bold">Sensibilisation</span> : informer et rappeler aux participant·e·s les consignes de sécurité (zones de baignade, comportements prohibés, utilisation du matériel).</li>
    </ol>
  </div>

  <!-- Article 10 -->
  <div class="cc-article">
    <h2>Article 10 – Rupture du CEE</h2>
    <p>Le contrat peut être rompu de plein droit en cas de force majeure, faute grave, impossibilité pour l'intéressé.e de continuer à exercer ses fonctions.</p>
    <p>L'annulation provisoire ou définitive d'un séjour pour raison de force majeure entraîne la rupture du présent contrat ipso facto et sans appel.</p>
  </div>

  <!-- Article 11 -->
  <div class="cc-article">
    <h2>Article 11 – Dispositions diverses</h2>
    <p>L'intéressé.e certifie sur l'honneur respecter les conditions définies aux articles D.432-1 et L.432-4 du Code de l'action sociale et des familles permettant la conclusion d'un contrat d'engagement éducatif. Il (elle) s'engage à faire connaître à ColoCrew, dans les plus brefs délais, tout changement dans sa situation personnelle, en particulier si ce changement rendait impossible l'application du statut de l'engagement éducatif.</p>
    <p>L'intéressé.e certifie sur l'honneur l'exactitude et la sincérité des informations mentionnées dans ce contrat concernant ses formations, ses stages, ses qualifications et ses diplômes. Le présent contrat devient automatiquement caduc s'il s'avère que l'intéressé.e a été engagé.e pour une qualification qu'il/elle ne possède pas réellement.</p>
    <p>L'intéressé.e certifie par ailleurs n'avoir encouru aucune condamnation pour crime ou délit contraire à la probité et aux bonnes mœurs, n'être pas frappé.e de l'interdiction d'enseigner ou de participer à la direction et à l'encadrement d'institutions ou d'organismes de vacances et de loisirs pour les mineurs.</p>
  </div>

  <!-- Signatures -->
  <div class="cc-signatures">
    <p class="cc-sign-place">Fait à Lanobre, le ${today}</p>
    <p><strong>Signatures :</strong></p>
    <div class="cc-sign-row">
      <div class="cc-sign-box">
        <p>• Pour l'Organisateur :</p>
      </div>
      <div class="cc-sign-box">
        <p>• Pour l'Animateur·rice :</p>
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
  const html = generateContractHTML(member, contract);
  const w = window.open("", "_blank", "width=820,height=960");
  if (!w) {
    alert("Votre navigateur a bloqué la popup. Autorisez les popups pour ce site.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
}
