"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, doc, getDocs, query, orderBy, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { useToast } from "@/src/contexts/ToastContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_MAP = {
  "2026-07-06": "S1",
  "2026-07-20": "S2",
  "2026-08-03": "S3",
  "2026-08-17": "S4",
};

const WEEK_LABELS = {
  S1: "S1 — 6 au 17 juil.",
  S2: "S2 — 20 au 31 juil.",
  S3: "S3 — 3 au 14 août",
  S4: "S4 — 17 au 28 août",
};

const SENDERS = [
  { name: "ColoCrew Inscriptions", email: "inscriptions@colocrew.com" },
  { name: "Equipe ColoCrew",       email: "equipe@colocrew.com" },
  { name: "William Dreyer",        email: "w.dreyer@colocrew.com" },
];

const MISSING_DOCS_OPTIONS = [
  { key: "fiche_sanitaire",     label: "Fiche sanitaire de liaison" },
  { key: "fiche_medicale",      label: "Fiche médicale" },
  { key: "autorisation_photo",  label: "Autorisation de photographie" },
  { key: "justificatif_caf",    label: "Justificatif CAF / Sécurité sociale" },
  { key: "acompte",             label: "Acompte de 100€" },
  { key: "assurance",           label: "Attestation d'assurance" },
  { key: "autorisation_sortie", label: "Autorisation de sortie" },
  { key: "attestation_natation", label: "Attestation de natation" },
];

const TEMPLATES = [
  {
    key: "bienvenue",
    label: "Bienvenue",
    defaultSubject: "ColoCrew — Bienvenue pour le séjour {{nom_sejour}} ({{semaine}})",
    defaultBody: `Bonjour {{prenom_parent}},

Nous sommes ravis de vous confirmer la participation de {{prenom_enfants}} au séjour {{nom_sejour}} — {{semaine}} ({{dates_sejour}}).

Votre dossier est bien enregistré sous la référence N° {{numero_reservation}}.

Notre équipe reviendra vers vous très prochainement avec toutes les informations pratiques concernant le séjour.

En cas de question, n'hésitez pas à nous contacter à cette adresse.

À très bientôt,
L'équipe ColoCrew`,
  },
  {
    key: "documents_manquants",
    label: "Documents manquants",
    defaultSubject: "ColoCrew — Documents manquants pour {{prenom_enfants}} (N° {{numero_reservation}})",
    defaultBody: `Bonjour {{prenom_parent}},

Nous revenons vers vous concernant le dossier de {{prenom_enfants}} pour le séjour {{nom_sejour}} — {{semaine}} (N° {{numero_reservation}}).

Afin de finaliser l'inscription, il nous manque les documents suivants :

{{liste_documents}}

Merci de nous les transmettre dans les meilleurs délais par retour de mail ou directement sur votre espace en ligne.

Pour toute question, nous restons disponibles.

À très bientôt,
L'équipe ColoCrew`,
  },
  {
    key: "rappel_acompte",
    label: "Rappel acompte",
    defaultSubject: "ColoCrew — Acompte à régler — N° {{numero_reservation}}",
    defaultBody: `Bonjour {{prenom_parent}},

Nous revenons vers vous concernant la réservation N° {{numero_reservation}} de {{prenom_enfants}} pour le séjour {{nom_sejour}} — {{semaine}}.

Pour confirmer définitivement la place, un acompte de 100€ est nécessaire. Il n'a pas encore été reçu de notre côté.

Vous pouvez régler cet acompte directement en ligne via le lien suivant :
{{lien_paiement}}

Ou par virement bancaire :
Titulaire : COLOCREW
IBAN : FR76 1695 8000 0158 6780 6033 040
BIC/SWIFT : QNTOFRP1XXX
Référence : {{numero_reservation}}

Sans règlement dans les prochains jours, nous ne pourrons malheureusement pas maintenir la réservation.

Pour toute question, n'hésitez pas à nous contacter.

À très bientôt,
L'équipe ColoCrew`,
  },
  {
    key: "infos_pratiques",
    label: "Infos pratiques",
    defaultSubject: "ColoCrew — Infos pratiques — {{nom_sejour}} {{semaine}}",
    defaultBody: `Bonjour {{prenom_parent}},

Le séjour de {{prenom_enfants}} approche ! Voici toutes les informations pratiques pour préparer au mieux ce départ.

[Complétez ici : point de rendez-vous, horaires, liste des affaires à apporter, contacts sur place, etc.]

Pour toute question, nous restons disponibles à cette adresse.

À très bientôt,
L'équipe ColoCrew`,
  },
  {
    key: "personnalise",
    label: "Personnalisé",
    defaultSubject: "",
    defaultBody: `Bonjour {{prenom_parent}},



À très bientôt,
L'équipe ColoCrew`,
  },
  {
    key: "convocation_transport",
    label: "Convocation transport",
    defaultSubject: "ColoCrew — Convocation de transport — {{nom_sejour}}",
    defaultBody: "",
  },
];

const VAR_BADGES_SUBJECT = [
  { label: "Prénom parent",     var: "prenom_parent" },
  { label: "Nom séjour",        var: "nom_sejour" },
  { label: "Semaine",           var: "semaine" },
  { label: "Prénoms enfants",   var: "prenom_enfants" },
  { label: "N° résa",           var: "numero_reservation" },
];

const VAR_BADGES_BODY = [
  { label: "Prénom parent",          var: "prenom_parent" },
  { label: "Nom parent",             var: "nom_parent" },
  { label: "Prénoms enfants",        var: "prenom_enfants" },
  { label: "Noms complets enfants",  var: "noms_enfants" },
  { label: "Nom séjour",             var: "nom_sejour" },
  { label: "Semaine",                var: "semaine" },
  { label: "Dates séjour",           var: "dates_sejour" },
  { label: "N° résa",                var: "numero_reservation" },
  { label: "Lien paiement",          var: "lien_paiement" },
  { label: "Liste documents",        var: "liste_documents" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function weekFromStartDate(iso) {
  return WEEK_MAP[String(iso || "").slice(0, 10)] || "";
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return "";
  const fmt = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  };
  return endDate ? `${fmt(startDate)} au ${fmt(endDate)}` : fmt(startDate);
}

function childrenFirstNames(minor) {
  const children = Array.isArray(minor?.children) ? minor.children : [];
  return children.map((c) => c.firstName || "").filter(Boolean).join(", ");
}

function childrenFullNames(minor) {
  const children = Array.isArray(minor?.children) ? minor.children : [];
  return children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean).join(", ");
}

function resolveVars(text, reservation, extraVars = {}) {
  if (!text) return "";
  const { legal = {}, minor = {}, sejour = {} } = reservation;
  const week = weekFromStartDate(sejour?.startDate);
  const vars = {
    prenom_parent:       legal.firstName || "",
    nom_parent:          legal.lastName || "",
    prenom_enfants:      childrenFirstNames(minor) || childrenFullNames(minor),
    noms_enfants:        childrenFullNames(minor),
    enfants_count:       String(Array.isArray(minor?.children) ? minor.children.length : 1),
    nom_sejour:          sejour.name || "",
    semaine:             week,
    dates_sejour:        formatDateRange(sejour.startDate, sejour.endDate),
    numero_reservation:  reservation.numeroDeReservation || "",
    lien_paiement:       reservation.stripeDepositUrl || "(lien non disponible)",
    liste_documents:     "",
    ...extraVars,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function bodyToHtml(bodyText) {
  const escaped = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const paragraphs = escaped.split(/\n\n+/).map((para) => {
    const lines = para.split(/\n/).join("<br/>");
    return `<p style="margin:0 0 16px;line-height:1.7;font-size:15px;">${lines}</p>`;
  });

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:#B8336A;padding:24px 32px;text-align:center;">
    <p style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 4px;">ColoCrew · Été 2026</p>
    <p style="color:#fff;margin:0;font-size:16px;font-weight:700;">Association ColoCrew</p>
  </div>
  <div style="padding:32px 32px 8px;">
    ${paragraphs.join("")}
  </div>
  <div style="border-top:1px solid #f0e8f5;padding:20px 32px;text-align:center;background:#fdf8fc;">
    <p style="margin:0;font-size:13px;color:#b0a0be;line-height:1.6;">
      Association ColoCrew<br/>
      <a href="https://www.colocrew.com" style="color:#B8336A;text-decoration:none;">www.colocrew.com</a> · contact@colocrew.com
    </p>
  </div>
</div>`;
}

// ─── Convocation Transport helpers ────────────────────────────────────────────

function normalizeCity(v) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function transportAllCities(transport) {
  const cities = new Set();
  for (const seg of transport.segments || []) {
    if (seg.from) cities.add(normalizeCity(seg.from));
    if (seg.to)   cities.add(normalizeCity(seg.to));
    for (const stop of seg.stops || []) if (stop.city) cities.add(normalizeCity(stop.city));
  }
  if (transport.departureCity) cities.add(normalizeCity(transport.departureCity));
  if (transport.arrivalCity)   cities.add(normalizeCity(transport.arrivalCity));
  return cities;
}

function findTransportForCity(transports, week, direction, city) {
  const nc = normalizeCity(city);
  if (!nc || nc === "sur place") return null;
  return transports.find(
    (t) => t.week === week && t.direction === direction && transportAllCities(t).has(nc)
  ) || null;
}

function getMeetingInfo(transport, city) {
  if (!transport) return null;
  const nc = normalizeCity(city);
  for (const seg of transport.segments || []) {
    const boardCity = transport.direction === "aller" ? seg.from : seg.to;
    if (normalizeCity(boardCity) === nc) {
      return {
        meetingPoint:  seg.meetingPoint  || transport.meetingPoint  || boardCity || "",
        meetingTime:   seg.meetingTime   || transport.meetingTime   || "",
        platform:      seg.platform      || transport.platform      || "",
        departureTime: seg.departureTime || transport.departureTime || "",
        trainType:     transport.trainType   || "",
        trainNumber:   transport.trainNumber || seg.number || "",
        date:          transport.date || "",
      };
    }
    for (const stop of seg.stops || []) {
      if (normalizeCity(stop.city) === nc) {
        return {
          meetingPoint:  stop.meetingPoint  || seg.meetingPoint  || transport.meetingPoint  || stop.city || "",
          meetingTime:   stop.meetingTime   || stop.arrivalTime  || seg.meetingTime         || transport.meetingTime  || "",
          platform:      stop.platform      || seg.platform      || transport.platform      || "",
          departureTime: stop.departureTime || seg.departureTime || transport.departureTime || "",
          trainType:     transport.trainType   || "",
          trainNumber:   transport.trainNumber || seg.number || "",
          date:          transport.date || "",
        };
      }
    }
  }
  return {
    meetingPoint:  transport.meetingPoint  || transport.departureCity || "",
    meetingTime:   transport.meetingTime   || "",
    platform:      transport.platform      || "",
    departureTime: transport.departureTime || "",
    trainType:     transport.trainType     || "",
    trainNumber:   transport.trainNumber   || "",
    date:          transport.date          || "",
  };
}

function fmtDateLong(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T00:00:00`);
  return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function buildConvocationHtml(reservation, allerTransport, retourTransport) {
  const legal   = reservation.legal   || {};
  const minor   = reservation.minor   || {};
  const sejour  = reservation.sejour  || {};
  const tpt     = reservation.transport || {};
  const children = Array.isArray(minor.children) ? minor.children : [];

  const allerCity  = tpt.departureCity || "";
  const retourCity = tpt.returnCity    || "";

  const allerM  = getMeetingInfo(allerTransport,  allerCity);
  const retourM = getMeetingInfo(retourTransport, retourCity);

  const allNames   = children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean);
  const firstNames = children.map((c) => c.firstName || "").filter(Boolean);
  const firstName  = firstNames[0] || legal.firstName || "votre enfant";
  const headerName = allNames.join(", ") || `${legal.firstName || ""} ${legal.lastName || ""}`.trim();
  const verb = children.length > 1 ? "sont inscrits" : "est inscrit(e)";

  const TBC = `<span style="color:#94a3b8;font-style:italic;">À confirmer.</span>`;

  const mkRdv = (m, city) => m?.meetingPoint
    ? `<strong>${m.meetingPoint}</strong>${m.platform ? `<br><span style="font-size:12px;color:#64748b;">Voie / quai ${m.platform}</span>` : ""}`
    : city ? `<strong>${city}</strong>` : TBC;

  const mkDateTime = (m, fallbackDate, accentColor) => {
    const d = m?.date || fallbackDate;
    return d
      ? `<strong>${fmtDateLong(d)}</strong>${m?.meetingTime ? `<br><span style="color:${accentColor};font-weight:700;">RDV à ${m.meetingTime}</span>` : ""}`
      : TBC;
  };

  const mkTrain = (m) => {
    const label = m?.trainType && m?.trainNumber ? `${m.trainType} n°${m.trainNumber}` : (m?.trainNumber ? `Train n°${m.trainNumber}` : "");
    const dep   = m?.departureTime ? `Départ à <strong>${m.departureTime}</strong>` : "";
    return [label, dep].filter(Boolean).join("<br>") || TBC;
  };

  const th = (label, bg, color) =>
    `<th style="padding:12px 16px;background:${bg};color:${color};font-weight:900;font-size:14px;text-align:center;border-bottom:2px solid #e5e7eb;">${label}</th>`;

  const tdLabel = (last) =>
    `style="padding:13px 16px;font-weight:700;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;background:#fafafa;border-right:1px solid #e5e7eb;${last ? "" : "border-bottom:1px solid #f0f0f0;"}width:27%;vertical-align:top;"`;
  const tdData = (last) =>
    `style="padding:13px 16px;border-right:1px solid #f0f0f0;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;
  const tdDataLast = (last) =>
    `style="padding:13px 16px;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Convocation transport — ${sejour.name || "ColoCrew"}</title>
</head>
<body style="margin:0;padding:20px 8px;background:#f0ebff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(30,16,64,0.12);">

  <!-- HEADER -->
  <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #B8336A;">
    <tr>
      <td style="padding:20px 28px 16px;vertical-align:middle;">
        <table style="border-collapse:collapse;"><tr>
          <td style="padding:0 10px 0 0;vertical-align:middle;">
            <div style="background:#B8336A;border-radius:8px;width:38px;height:38px;text-align:center;line-height:38px;">
              <span style="color:#fff;font-weight:900;font-size:16px;letter-spacing:-1px;">CC</span>
            </div>
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:19px;font-weight:900;color:#B8336A;line-height:1.1;letter-spacing:-0.02em;">ColoCrew</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:1px;">réinventons les colos !</div>
          </td>
        </tr></table>
      </td>
      <td style="padding:20px 28px 16px;text-align:right;vertical-align:top;font-size:12px;color:#64748b;line-height:1.9;">
        <div>📧 info@colocrew.com</div>
        <div>📞 01 84 21 02 30</div>
        <div>🌐 colocrew.com</div>
      </td>
    </tr>
  </table>

  <!-- TITLE -->
  <div style="padding:24px 28px 8px;">
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#B8336A;line-height:1.3;">
      🚅 Convocation de transport — ${sejour.name || "Séjour ColoCrew"}
    </h1>
    <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#1e1040;">
      ${headerName} — DOSSIER N°${reservation.numeroDeReservation || "—"}
    </p>
    <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.75;">
      <strong>${firstNames.join(" et ") || firstName}</strong> ${verb} au séjour
      <strong>${sejour.name || "ColoCrew"}</strong>
      du <strong>${fmtDateLong(sejour.startDate)}</strong> au <strong>${fmtDateLong(sejour.endDate)}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.75;">
      Vous trouverez ci-dessous les informations de transport encadré.
    </p>
  </div>

  <!-- TRANSPORT TABLE -->
  <div style="padding:0 28px 20px;">
    <table style="width:100%;border-collapse:collapse;border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead>
        <tr>
          <td style="padding:11px 16px;background:#f8f9fa;border-right:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;width:27%;"></td>
          ${th("↑ ALLER", "#f0fdf4", "#16a34a")}
          ${th("↓ RETOUR", "#fff7ed", "#ea580c").replace('border-bottom', 'border-left:1px solid #e5e7eb;border-bottom')}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td ${tdLabel(false)}>Lieu de<br>rendez-vous</td>
          <td ${tdData(false)}>${mkRdv(allerM, allerCity)}</td>
          <td ${tdDataLast(false)}>${mkRdv(retourM, retourCity)}</td>
        </tr>
        <tr>
          <td ${tdLabel(false)}>Date &amp; heure de<br>rendez-vous</td>
          <td ${tdData(false)}>${mkDateTime(allerM,  sejour.startDate, "#16a34a")}</td>
          <td ${tdDataLast(false)}>${mkDateTime(retourM, sejour.endDate,   "#ea580c")}</td>
        </tr>
        <tr>
          <td ${tdLabel(true)}>Informations<br>complémentaires</td>
          <td ${tdData(true)}>${mkTrain(allerM)}</td>
          <td ${tdDataLast(true)}>${mkTrain(retourM)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PERMANENCE -->
  <div style="margin:0 28px 20px;padding:14px 20px;background:linear-gradient(135deg,#fff0f6,#f5f0ff);border:1.5px solid #f3d0e6;border-radius:10px;text-align:center;">
    <p style="margin:0;font-size:15px;font-weight:800;color:#B8336A;">📞 Permanence transport : 06 11 91 37 64 📞</p>
  </div>

  <!-- DÉROULÉ -->
  <div style="padding:0 28px 28px;">
    <h2 style="font-size:14px;font-weight:900;color:#1e1040;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f5f0ff;">
      🧳 Déroulé du transport encadré par ColoCrew
    </h2>
    <ul style="margin:0;padding-left:18px;font-size:14px;color:#374151;line-height:1.9;">
      <li>Le rendez-vous est fixé <strong>1h avant le départ du train.</strong></li>
      <li>Un animateur attendra les enfants au point de rendez-vous, reconnaissable grâce à un <strong>écriteau COLOCREW.</strong></li>
      <li>Les responsables légaux sont invités à <strong>se présenter à l'animateur,</strong> disponible pour répondre à vos questions.</li>
      <li>Si votre enfant se rend seul(e) au point de rendez-vous, merci de nous fournir <strong>la décharge de responsabilité</strong> (ci-jointe) qu'il/elle remettra directement à l'animateur.</li>
      <li>L'animateur prendra ensuite en charge le groupe et assurera un <strong>trajet encadré et sécurisé</strong> jusqu'au lieu de séjour.</li>
      <li>Pour le retour, si l'enfant doit rentrer seul(e) ou être récupéré(e) par une tierce personne, merci de nous fournir <strong>la décharge de responsabilité</strong> (ci-jointe) qu'il/elle remettra directement à l'animateur.</li>
    </ul>
  </div>

  <!-- FOOTER -->
  <div style="border-top:2px solid #f5f0ff;padding:16px 28px;text-align:center;background:#fdf8fc;">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">Association ColoCrew — SIRET : 9 3 2 1 7 1 4 3 2 0 0 0 1 0</p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Suivez-nous sur les réseaux : @_colocrew/ColoCrew</p>
  </div>

</div>
</body>
</html>`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VarBadge({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "3px 9px",
        background: "#f3eef8",
        border: "1px solid #d4c0e8",
        borderRadius: 20,
        fontSize: 11,
        color: "#7c3aed",
        cursor: "pointer",
        fontWeight: 600,
        whiteSpace: "nowrap",
        lineHeight: 1.5,
      }}
    >
      {label}
    </button>
  );
}

function StatusDot({ status }) {
  const color = { pending: "#f97316", validated: "#10b981", deleted: "#94a3b8" }[status] || "#94a3b8";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

function SendResultsPanel({ progress, onReset }) {
  const failed = progress.errors;
  const succeeded = progress.done - failed.length;
  return (
    <div style={{ padding: "20px 28px", flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{
          textAlign: "center", padding: "32px 24px",
          background: failed.length === 0 ? "#f0fdf4" : "#fff7ed",
          border: `1.5px solid ${failed.length === 0 ? "#86efac" : "#fed7aa"}`,
          borderRadius: 14, marginBottom: 20,
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{failed.length === 0 ? "✓" : "⚠"}</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1e1040" }}>
            {failed.length === 0
              ? `${succeeded} email(s) envoyé(s) avec succès`
              : `${succeeded} succès · ${failed.length} erreur(s)`}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Envoi terminé sur {progress.total} destinataire(s)
          </div>
        </div>

        {failed.length > 0 && (
          <div style={{ background: "#fff", border: "1.5px solid #fecaca", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#fef2f2", fontSize: 12, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Erreurs d&apos;envoi
            </div>
            {failed.map((e, i) => (
              <div key={i} style={{ padding: "10px 16px", borderTop: i > 0 ? "1px solid #fee2e2" : "none", fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: "#1e1040" }}>{e.email}</div>
                <div style={{ color: "#ef4444", fontSize: 12, marginTop: 2 }}>{e.error}</div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onReset}
          style={{ ...btnStyle, background: "#7c3aed", color: "#fff", marginTop: 20, width: "100%", justifyContent: "center" }}
        >
          Nouveau message
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Communication() {
  const { showToast } = useToast();

  // Data
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterSejour, setFilterSejour] = useState("all");
  const [filterWeek, setFilterWeek] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterConvocation, setFilterConvocation] = useState("all"); // "all" | "sent" | "not_sent"
  const [search, setSearch] = useState("");

  // Selection
  const [selected, setSelected] = useState(new Set());

  // Composer
  const [templateKey, setTemplateKey] = useState("bienvenue");
  const [subject, setSubject] = useState(TEMPLATES[0].defaultSubject);
  const [body, setBody] = useState(TEMPLATES[0].defaultBody);
  const [sender, setSender] = useState(SENDERS[0]);
  const [missingDocs, setMissingDocs] = useState(new Set());
  const [transports, setTransports] = useState([]);

  // Send state
  const [sendState, setSendState] = useState("idle"); // "idle" | "sending" | "done"
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, errors: [] });

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  const subjectRef = useRef(null);
  const bodyRef = useRef(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(
          query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))
        );
        setReservations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        showToast("Erreur de chargement des réservations", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "asc")))
      .then((snap) => setTransports(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(console.error);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const sejourOptions = useMemo(() => {
    const names = new Set(reservations.map((r) => r.sejour?.name).filter(Boolean));
    return [...names].sort();
  }, [reservations]);

  const filtered = useMemo(() => {
    return reservations.filter((r) => {
      if (!r.legal?.email) return false;
      if (filterSejour !== "all" && r.sejour?.name !== filterSejour) return false;
      if (filterWeek !== "all" && weekFromStartDate(r.sejour?.startDate) !== filterWeek) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterConvocation === "sent"     && !r.convocationSent) return false;
      if (filterConvocation === "not_sent" &&  r.convocationSent) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${r.legal?.firstName || ""} ${r.legal?.lastName || ""}`.toLowerCase();
        const email = (r.legal?.email || "").toLowerCase();
        const num = (r.numeroDeReservation || "").toLowerCase();
        const kids = childrenFullNames(r.minor).toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !num.includes(q) && !kids.includes(q)) return false;
      }
      return true;
    });
  }, [reservations, filterSejour, filterWeek, filterStatus, filterConvocation, search]);

  const selectedList = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected]
  );

  // ── Template ──────────────────────────────────────────────────────────────

  const handleTemplateChange = useCallback((key) => {
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setTemplateKey(key);
    setSubject(tpl.defaultSubject);
    setBody(tpl.defaultBody);
    setMissingDocs(new Set());
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(filtered.map((r) => r.id))), [filtered]);
  const deselectAll = useCallback(() => setSelected(new Set()), []);

  // ── Convocation status ────────────────────────────────────────────────────

  const toggleConvocation = useCallback(async (res) => {
    const next = !res.convocationSent;
    try {
      await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, res.id), {
        convocationSent: next,
        convocationSentAt: next ? serverTimestamp() : null,
      });
      setReservations((prev) =>
        prev.map((r) => r.id === res.id ? { ...r, convocationSent: next, convocationSentAt: next ? new Date().toISOString() : null } : r)
      );
    } catch {
      showToast("Erreur lors de la mise à jour", "error");
    }
  }, [showToast]);

  // ── Variable insertion ────────────────────────────────────────────────────

  const insertVar = useCallback((varName, ref, setter) => {
    const el = ref?.current;
    const token = `{{${varName}}}`;
    if (!el) {
      setter((prev) => prev + token);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newVal = el.value.slice(0, start) + token + el.value.slice(end);
    setter(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }, []);

  // ── Extra vars ────────────────────────────────────────────────────────────

  const getExtraVars = useCallback(() => {
    if (templateKey === "documents_manquants" && missingDocs.size > 0) {
      const list = [...missingDocs]
        .map((k) => MISSING_DOCS_OPTIONS.find((o) => o.key === k)?.label)
        .filter(Boolean)
        .map((label) => `• ${label}`)
        .join("\n");
      return { liste_documents: list };
    }
    return {};
  }, [templateKey, missingDocs]);

  // ── Preview ───────────────────────────────────────────────────────────────

  const previewReservation = selectedList[previewIdx] || null;

  const previewHtml = useMemo(() => {
    if (!previewReservation) return "";
    if (templateKey === "convocation_transport") {
      const week = weekFromStartDate(previewReservation.sejour?.startDate);
      const aC = previewReservation.transport?.departureCity || "";
      const rC = previewReservation.transport?.returnCity    || "";
      return buildConvocationHtml(
        previewReservation,
        findTransportForCity(transports, week, "aller",  aC),
        findTransportForCity(transports, week, "retour", rC),
      );
    }
    return bodyToHtml(resolveVars(body, previewReservation, getExtraVars()));
  }, [previewReservation, body, getExtraVars, templateKey, transports]);

  const previewSubject = useMemo(() => {
    if (!previewReservation) return "";
    return resolveVars(subject, previewReservation, getExtraVars());
  }, [previewReservation, subject, getExtraVars]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendBatch = useCallback(async () => {
    if (selectedList.length === 0) { showToast("Aucun destinataire sélectionné", "error"); return; }
    if (!subject.trim()) { showToast("L'objet du mail est obligatoire", "error"); return; }

    setSendState("sending");
    setSendProgress({ done: 0, total: selectedList.length, errors: [] });

    const extraVars = getExtraVars();
    const errors = [];

    for (let i = 0; i < selectedList.length; i++) {
      const res = selectedList[i];
      try {
        const resp = await fetch("/api/communication/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: res.legal.email,
            subject: resolveVars(subject, res, extraVars),
            html: templateKey === "convocation_transport"
              ? buildConvocationHtml(
                  res,
                  findTransportForCity(transports, weekFromStartDate(res.sejour?.startDate), "aller",  res.transport?.departureCity || ""),
                  findTransportForCity(transports, weekFromStartDate(res.sejour?.startDate), "retour", res.transport?.returnCity    || ""),
                )
              : bodyToHtml(resolveVars(body, res, extraVars)),
            from_name: sender.name,
            from_email: sender.email,
          }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `HTTP ${resp.status}`);
        }
        if (templateKey === "convocation_transport") {
          updateDoc(doc(db, COLLECTIONS.RESERVATIONS, res.id), {
            convocationSent: true,
            convocationSentAt: serverTimestamp(),
          }).then(() => {
            setReservations((prev) =>
              prev.map((r) => r.id === res.id ? { ...r, convocationSent: true } : r)
            );
          }).catch(console.error);
        }
      } catch (e) {
        errors.push({ email: res.legal.email, error: e.message });
      }

      const done = i + 1;
      setSendProgress({ done, total: selectedList.length, errors: [...errors] });

      if (i < selectedList.length - 1) await new Promise((r) => setTimeout(r, 350));
    }

    setSendState("done");
    if (errors.length === 0) {
      showToast(`${selectedList.length} email(s) envoyé(s) avec succès`, "success");
    } else {
      showToast(`${selectedList.length - errors.length} succès, ${errors.length} erreur(s)`, "error");
    }
  }, [selectedList, subject, body, sender, getExtraVars, showToast, templateKey, transports]);

  const resetSend = useCallback(() => {
    setSendState("idle");
    setSendProgress({ done: 0, total: 0, errors: [] });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320, color: "#94a3b8", fontSize: 14 }}>
        Chargement des réservations…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)", overflow: "hidden", background: "#fff" }}>

      {/* ── Header ── */}
      <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #f0e8f5", flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1e1040" }}>Communication familles</h1>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "#94a3b8" }}>
          {reservations.length} réservations · {filtered.length} visible(s) · {selected.size} sélectionnée(s)
        </p>
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left : filtres + liste ── */}
        <div style={{ width: 360, flexShrink: 0, borderRight: "1px solid #f0e8f5", display: "flex", flexDirection: "column", background: "#fdfcff" }}>

          {/* Filtres */}
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #f0e8f5", display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              placeholder="Recherche (nom, email, N° résa, enfant…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={filterSejour} onChange={(e) => setFilterSejour(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                <option value="all">Tous les séjours</option>
                {sejourOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                <option value="all">Toutes semaines</option>
                {Object.entries(WEEK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                <option value="all">Tous les statuts</option>
                <option value="pending">En cours</option>
                <option value="validated">Validées</option>
                <option value="deleted">Passées</option>
              </select>
              <select value={filterConvocation} onChange={(e) => setFilterConvocation(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                <option value="all">Toutes convocations</option>
                <option value="not_sent">🔴 Sans convocation</option>
                <option value="sent">✅ Convoquées</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={selectAll} style={btnSmallStyle}>
                Tout sélect. ({filtered.length})
              </button>
              <button type="button" onClick={deselectAll} style={{ ...btnSmallStyle, background: "#f1f5f9", color: "#64748b", border: "1.5px solid #e2e8f0" }}>
                Effacer
              </button>
            </div>
          </div>

          {/* Liste */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                Aucune réservation trouvée
              </div>
            ) : (
              filtered.map((res) => {
                const isSelected = selected.has(res.id);
                const week = weekFromStartDate(res.sejour?.startDate);
                const kidsNames = childrenFirstNames(res.minor) || childrenFullNames(res.minor);
                return (
                  <div
                    key={res.id}
                    onClick={() => toggleSelect(res.id)}
                    style={{
                      padding: "9px 14px",
                      borderBottom: "1px solid #f5f3ff",
                      cursor: "pointer",
                      background: isSelected ? "#f5f0ff" : "transparent",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 3,
                      border: `2px solid ${isSelected ? "#7c3aed" : "#d1d5db"}`,
                      background: isSelected ? "#7c3aed" : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isSelected && (
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: "#1e1040" }}>
                        {res.legal?.firstName} {res.legal?.lastName}
                        <StatusDot status={res.status} />
                      </div>
                      {kidsNames && (
                        <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {kidsNames}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", gap: 6, alignItems: "center", marginTop: 1 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{res.sejour?.name}</span>
                        {week && <span style={{ fontWeight: 800, color: "#7c3aed", flexShrink: 0 }}>{week}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {res.legal?.email}
                      </div>
                      {res.convocationSent && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Convocation envoyée
                        </div>
                      )}
                    </div>

                    {/* Actions : toggle convocation + aperçu */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleConvocation(res); }}
                        title={res.convocationSent ? "Annuler convocation envoyée" : "Marquer convocation envoyée"}
                        style={{
                          background: res.convocationSent ? "#dcfce7" : "#f1f5f9",
                          border: `1.5px solid ${res.convocationSent ? "#86efac" : "#e2e8f0"}`,
                          borderRadius: 6, cursor: "pointer", padding: "2px 5px",
                          color: res.convocationSent ? "#16a34a" : "#94a3b8",
                          fontSize: 13, lineHeight: 1, flexShrink: 0,
                        }}
                      >
                        {res.convocationSent ? "✓" : "🚅"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const idx = selectedList.findIndex((r) => r.id === res.id);
                          setPreviewIdx(idx >= 0 ? idx : 0);
                          if (!selected.has(res.id)) {
                            toggleSelect(res.id);
                            setPreviewIdx(0);
                          }
                          setPreviewOpen(true);
                        }}
                        title="Aperçu email"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#c4b5fd", padding: 0 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right : composer ── */}
        {sendState === "done" ? (
          <SendResultsPanel progress={sendProgress} onReset={resetSend} />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Composer scroll area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 8px" }}>

              {/* Template chips */}
              <div style={{ marginBottom: 20 }}>
                <div style={labelStyle}>Modèle d&apos;email</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TEMPLATES.map((tpl) => {
                    const active = templateKey === tpl.key;
                    return (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => handleTemplateChange(tpl.key)}
                        style={{
                          padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
                          border: `2px solid ${active ? "#7c3aed" : "#e5e7eb"}`,
                          background: active ? "#7c3aed" : "#fff",
                          color: active ? "#fff" : "#374151",
                          transition: "all 0.15s",
                        }}
                      >
                        {tpl.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Documents manquants selector */}
              {templateKey === "documents_manquants" && (
                <div style={{ marginBottom: 20, padding: 16, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
                  <div style={{ ...labelStyle, color: "#c2410c", marginBottom: 10 }}>Documents à mentionner</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {MISSING_DOCS_OPTIONS.map((opt) => {
                      const checked = missingDocs.has(opt.key);
                      return (
                        <label
                          key={opt.key}
                          style={{
                            display: "flex", alignItems: "center", gap: 5, padding: "4px 11px",
                            background: checked ? "#fff7ed" : "#fff",
                            border: `1.5px solid ${checked ? "#f97316" : "#e5e7eb"}`,
                            borderRadius: 20, cursor: "pointer", fontSize: 12,
                            fontWeight: checked ? 700 : 500, color: checked ? "#c2410c" : "#374151",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setMissingDocs((prev) => {
                              const next = new Set(prev);
                              next.has(opt.key) ? next.delete(opt.key) : next.add(opt.key);
                              return next;
                            })}
                            style={{ display: "none" }}
                          />
                          {checked ? "✓ " : ""}{opt.label}
                        </label>
                      );
                    })}
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: "#92400e" }}>
                    La liste sera insérée à l&apos;emplacement <code>{"{{liste_documents}}"}</code> dans le message.
                  </p>
                </div>
              )}

              {/* Expéditeur */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Expéditeur</label>
                <select
                  value={sender.email}
                  onChange={(e) => setSender(SENDERS.find((s) => s.email === e.target.value) || SENDERS[0])}
                  style={selectStyle}
                >
                  {SENDERS.map((s) => (
                    <option key={s.email} value={s.email}>{s.name} &lt;{s.email}&gt;</option>
                  ))}
                </select>
              </div>

              {/* Objet */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Objet</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
                  {VAR_BADGES_SUBJECT.map((v) => (
                    <VarBadge key={v.var} label={v.label} onClick={() => insertVar(v.var, subjectRef, setSubject)} />
                  ))}
                </div>
                <input
                  ref={subjectRef}
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Objet du mail…"
                  style={inputStyle}
                />
              </div>

              {/* Corps */}
              {templateKey === "convocation_transport" ? (
                <div style={{ padding: "18px 20px", background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#15803d", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 16 }}>🚅</span> Email de convocation auto-généré
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#166534", lineHeight: 1.65 }}>
                    Le corps de l&apos;email est généré automatiquement pour chaque famille à partir des données Firebase :
                  </p>
                  <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 12.5, color: "#166534", lineHeight: 1.9 }}>
                    <li>Nom du séjour, dates du séjour, n° de dossier</li>
                    <li>Prénom(s) et nom(s) des enfants inscrits</li>
                    <li><strong>Point de RDV aller</strong> — déduit de la ville de départ de la réservation</li>
                    <li>Date &amp; heure de RDV, voie, numéro de train</li>
                    <li><strong>Point de RDV retour</strong> — si le transport retour est configuré dans Firebase</li>
                    <li>Numéro de permanence transport + déroulé ColoCrew</li>
                  </ul>
                  <p style={{ margin: 0, fontSize: 12, color: "#15803d", fontStyle: "italic" }}>
                    Utilisez &quot;Aperçu&quot; pour vérifier le rendu personnalisé avant d&apos;envoyer.
                  </p>
                </div>
              ) : (
                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>Corps du message</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
                    {VAR_BADGES_BODY.map((v) => (
                      <VarBadge key={v.var} label={v.label} onClick={() => insertVar(v.var, bodyRef, setBody)} />
                    ))}
                  </div>
                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={16}
                    placeholder="Corps du message…"
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "'Courier New', Courier, monospace", fontSize: 13, lineHeight: 1.65 }}
                  />
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
                    Cliquez sur un badge pour insérer une variable. Le texte sera automatiquement mis en forme dans l&apos;email.
                  </p>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div style={{ padding: "12px 28px", borderTop: "1px solid #f0e8f5", background: "#fff", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              {sendState === "sending" ? (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: 5 }}>
                    Envoi en cours… {sendProgress.done}/{sendProgress.total}
                    {sendProgress.errors.length > 0 && (
                      <span style={{ color: "#ef4444", marginLeft: 8 }}>· {sendProgress.errors.length} erreur(s)</span>
                    )}
                  </div>
                  <div style={{ height: 6, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", background: "#7c3aed", borderRadius: 999,
                      width: `${(sendProgress.done / sendProgress.total) * 100}%`,
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: "#64748b", flex: 1 }}>
                    {selected.size === 0
                      ? "Sélectionnez des destinataires dans la liste"
                      : `${selected.size} destinataire(s) sélectionné(s)`}
                  </span>

                  <button
                    type="button"
                    disabled={selectedList.length === 0}
                    onClick={() => { setPreviewIdx(0); setPreviewOpen(true); }}
                    style={{
                      ...btnStyle,
                      background: selectedList.length === 0 ? "#f8fafc" : "#f5f0ff",
                      color: selectedList.length === 0 ? "#cbd5e1" : "#7c3aed",
                      border: `1.5px solid ${selectedList.length === 0 ? "#e2e8f0" : "#d4c0e8"}`,
                      cursor: selectedList.length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                    Aperçu
                  </button>

                  <button
                    type="button"
                    disabled={selectedList.length === 0}
                    onClick={sendBatch}
                    style={{
                      ...btnStyle,
                      background: selectedList.length === 0 ? "#f1f5f9" : "#B8336A",
                      color: selectedList.length === 0 ? "#94a3b8" : "#fff",
                      cursor: selectedList.length === 0 ? "not-allowed" : "pointer",
                      boxShadow: selectedList.length > 0 ? "0 4px 12px rgba(184,51,106,0.3)" : "none",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Envoyer{selectedList.length > 0 ? ` (${selectedList.length})` : ""}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Preview modal ── */}
      {previewOpen && previewReservation && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0e8f5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e1040" }}>Aperçu de l&apos;email</div>
                <div style={{ fontSize: 12, color: "#7c3aed", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {previewReservation.legal?.firstName} {previewReservation.legal?.lastName} · {previewReservation.legal?.email}
                </div>
              </div>

              {/* Navigation entre destinataires */}
              {selectedList.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
                    disabled={previewIdx <= 0}
                    style={{ ...btnSmallStyle, padding: "4px 8px", opacity: previewIdx <= 0 ? 0.4 : 1 }}
                  >←</button>
                  <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                    {previewIdx + 1} / {selectedList.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewIdx((i) => Math.min(selectedList.length - 1, i + 1))}
                    disabled={previewIdx >= selectedList.length - 1}
                    style={{ ...btnSmallStyle, padding: "4px 8px", opacity: previewIdx >= selectedList.length - 1 ? 0.4 : 1 }}
                  >→</button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontWeight: 700, color: "#64748b", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >✕</button>
            </div>

            {/* Subject preview */}
            <div style={{ padding: "8px 18px", background: "#fafafa", borderBottom: "1px solid #f0e8f5" }}>
              <span style={{ fontSize: 12, color: "#374151" }}>
                <strong>Objet :</strong> {previewSubject}
              </span>
            </div>

            {/* Email body preview */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", background: "#f8f9fa" }}>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>

            {/* Modal footer */}
            <div style={{ padding: "12px 18px", borderTop: "1px solid #f0e8f5", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                style={{ ...btnStyle, background: "#f1f5f9", color: "#64748b" }}
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => { setPreviewOpen(false); sendBatch(); }}
                style={{ ...btnStyle, background: "#B8336A", color: "#fff" }}
              >
                Envoyer ({selectedList.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1.5px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 13,
  color: "#1e1040",
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};

const selectStyle = {
  ...inputStyle,
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 30,
  cursor: "pointer",
};

const btnStyle = {
  padding: "9px 18px",
  borderRadius: 8,
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  transition: "opacity 0.15s",
};

const btnSmallStyle = {
  padding: "5px 11px",
  borderRadius: 6,
  border: "1.5px solid #e2e8f0",
  background: "#f5f0ff",
  color: "#7c3aed",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 6,
};
