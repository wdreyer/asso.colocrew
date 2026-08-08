"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
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
  { name: "ColoCrew", email: "contact@colocrew.com" },
];

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const LATEST_PLACES_TEMPLATE_KEY = "dernieres_places_aout";
const SMS_TEST_PHONE = "0687916897";
const SMS_S4_RELANCE_DEFAULT = `ColoCrew : il reste quelques places pour le sejour d'aout S4 de {{prenom_enfants}}. Pour bloquer la place, repondez OUI a ce SMS ou appelez William au 06 87 91 68 97. Ref {{numero_reservation}}`;

const STATUS_FILTERS = [
  { value: "validated", label: "Validées" },
  { value: "pending", label: "En cours non validées" },
  { value: "all", label: "Tous statuts" },
];

const MISSING_DOCS_OPTIONS = [
  { key: "fiche_sanitaire",      label: "Fiche sanitaire de liaison" },
  { key: "fiche_medicale",       label: "Fiche médicale" },
  { key: "autorisation_photo",   label: "Autorisation de photographie" },
  { key: "justificatif_caf",     label: "Justificatif CAF / Sécurité sociale" },
  { key: "acompte",              label: "Acompte de 100€" },
  { key: "assurance",            label: "Attestation d'assurance" },
  { key: "autorisation_sortie",  label: "Autorisation de sortie" },
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
    key: "lancement_sejours",
    label: "Lancement des séjours",
    defaultSubject: "ColoCrew — Lancement des séjours {{nom_sejour}} ({{semaine}})",
    defaultBody: `Bonjour {{prenom_parent}},

Le départ approche pour {{prenom_enfants}} : nous sommes très heureux de bientôt accueillir les jeunes sur le séjour {{nom_sejour}} — {{semaine}} ({{dates_sejour}}).

Avant le départ, merci de bien vérifier que les documents demandés ont été transmis à l'équipe ColoCrew.

Pour rappel, selon les situations et les séjours, les documents peuvent notamment concerner :

• les vaccins / le carnet de santé ;
• la carte d'identité ;
• le test nautique.

Ce rappel est générique : tous les documents ne concernent pas forcément tous les enfants. Si un document ne s'applique pas à votre situation, vous pouvez simplement ne pas en tenir compte.

Merci de nous envoyer les éléments manquants par retour de mail dès que possible, afin que les dossiers soient bien complets avant le départ.

Nous reviendrons vers vous avec les dernières informations pratiques si nécessaire.

À très bientôt,
L'équipe ColoCrew`,
  },
  {
    key: LATEST_PLACES_TEMPLATE_KEY,
    label: "Dernières places août",
    defaultSubject: "ColoCrew — Dernières places pour août : acompte à régler",
    defaultBody: `Bonjour {{prenom_parent}},

Nous revenons vers vous concernant la réservation N° {{numero_reservation}} de {{prenom_enfants}} pour le séjour {{nom_sejour}} — {{semaine}} ({{dates_sejour}}).

Il nous reste seulement quelques places pour les séjours d'août. Pour bloquer définitivement la place de {{prenom_enfants}}, il faut régler l'acompte de 100€.

Vous pouvez régler cet acompte directement en ligne via le lien suivant :
{{lien_paiement}}

Ou par virement bancaire :
Titulaire : COLOCREW
IBAN : FR76 1695 8000 0158 6780 6033 040
BIC/SWIFT : QNTOFRP1XXX
Référence : {{numero_reservation}}

Sans acompte, la réservation reste en cours et la place n'est pas bloquée.

Pour toute question, n'hésitez pas à nous contacter.

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
];

const VAR_BADGES_SUBJECT = [
  { label: "Prénom parent",   var: "prenom_parent" },
  { label: "Nom séjour",      var: "nom_sejour" },
  { label: "Semaine",         var: "semaine" },
  { label: "Prénoms enfants", var: "prenom_enfants" },
  { label: "N° résa",         var: "numero_reservation" },
];

const VAR_BADGES_BODY = [
  { label: "Prénom parent",         var: "prenom_parent" },
  { label: "Nom parent",            var: "nom_parent" },
  { label: "Prénoms enfants",       var: "prenom_enfants" },
  { label: "Noms complets enfants", var: "noms_enfants" },
  { label: "Nom séjour",            var: "nom_sejour" },
  { label: "Semaine",               var: "semaine" },
  { label: "Dates séjour",          var: "dates_sejour" },
  { label: "N° résa",               var: "numero_reservation" },
  { label: "Lien paiement",         var: "lien_paiement" },
  { label: "Liste documents",       var: "liste_documents" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function weekFromStartDate(iso) {
  return WEEK_MAP[String(iso || "").slice(0, 10)] || "";
}

function isValidatedReservation(reservation) {
  return reservation?.status === "validated";
}

function isPendingReservation(reservation) {
  return reservation?.status === "pending" || (!isValidatedReservation(reservation) && reservation?.status !== "deleted");
}

function reservationChildCount(reservation) {
  const count = Array.isArray(reservation?.minor?.children) ? reservation.minor.children.length : 0;
  return count > 0 ? count : 1;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
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

function contactPhone(reservation) {
  const legal = reservation?.legal || {};
  return legal.phone || legal.telephone || reservation?.phone || "";
}

function normalizeSmsPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const first = raw.split(/[,\n;/]+/).map((item) => item.trim()).find(Boolean) || "";
  const compact = first.replace(/[^\d+]/g, "");
  if (/^\+33[67]\d{8}$/.test(compact)) return compact;
  if (/^0033[67]\d{8}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^0[67]\d{8}$/.test(compact)) return `+33${compact.slice(1)}`;
  if (/^33[67]\d{8}$/.test(compact)) return `+${compact}`;
  return "";
}

function resolveVars(text, reservation, extraVars = {}) {
  if (!text) return "";
  const { legal = {}, minor = {}, sejour = {} } = reservation;
  const week = weekFromStartDate(sejour?.startDate);
  const vars = {
    prenom_parent:      legal.firstName || "",
    nom_parent:         legal.lastName  || "",
    prenom_enfants:     childrenFirstNames(minor) || childrenFullNames(minor),
    noms_enfants:       childrenFullNames(minor),
    enfants_count:      String(Array.isArray(minor?.children) ? minor.children.length : 1),
    nom_sejour:         sejour.name || "",
    semaine:            week,
    dates_sejour:       formatDateRange(sejour.startDate, sejour.endDate),
    numero_reservation: reservation.numeroDeReservation || "",
    lien_paiement:      reservation.stripeDepositUrl || "(lien non disponible)",
    liste_documents:    "",
    ...extraVars,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

async function createDepositStripeLink(reservation) {
  const { legal = {}, sejour = {}, transport = {}, payment = {}, options = {} } = reservation;
  const response = await fetch("/api/create-stripe-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenUnique: reservation.tokenUnique,
      amount: 100,
      currency: "eur",
      sejourTitle: sejour.name || "Séjour ColoCrew",
      ageGroup: sejour.ageGroup || "",
      startDate: sejour.startDate,
      endDate: sejour.endDate,
      transportFee: Number(transport.price || payment.transportAmount || 0),
      insuranceOpted: Boolean(options.insurance || payment.insuranceFee || payment.assurance),
      paymentOption: "deposit",
      customer_email: legal.email || undefined,
      metadata: {
        paymentType: "deposit",
        numeroDeReservation: reservation.numeroDeReservation || "",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error || "Lien Stripe acompte impossible à générer");
  }
  return data.url;
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

function SendResultsPanel({ progress, onReset, channel = "email" }) {
  const failed = progress.errors;
  const succeeded = progress.done - failed.length;
  const itemLabel = channel === "sms" ? "SMS" : "email(s)";
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
              ? `${succeeded} ${itemLabel} envoyé(s) avec succès`
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
  const [activeChannel, setActiveChannel] = useState("email");

  // Data
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterSejour, setFilterSejour] = useState("all");
  const [filterWeek, setFilterWeek] = useState("all");
  const [filterStatus, setFilterStatus] = useState("validated");
  const [search, setSearch] = useState("");

  // Selection
  const [selected, setSelected] = useState(new Set());

  // Composer
  const [templateKey, setTemplateKey] = useState("bienvenue");
  const [subject, setSubject] = useState(TEMPLATES[0].defaultSubject);
  const [body, setBody] = useState(TEMPLATES[0].defaultBody);
  const [sender, setSender] = useState(SENDERS[0]);
  const [missingDocs, setMissingDocs] = useState(new Set());
  const [attachments, setAttachments] = useState([]);
  const [smsSender, setSmsSender] = useState("ColoCrew");
  const [smsBody, setSmsBody] = useState(SMS_S4_RELANCE_DEFAULT);
  const [smsTestSending, setSmsTestSending] = useState(false);

  // Send state
  const [sendState, setSendState] = useState("idle");
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, errors: [] });

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const smsBodyRef = useRef(null);
  const attachmentInputRef = useRef(null);

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

  // ── Derived ───────────────────────────────────────────────────────────────

  const validatedReservations = useMemo(
    () => reservations.filter(isValidatedReservation),
    [reservations],
  );

  const validStats = useMemo(() => {
    const withEmail = validatedReservations.filter((r) => r.legal?.email).length;
    const children = validatedReservations.reduce((sum, r) => sum + reservationChildCount(r), 0);
    return { files: validatedReservations.length, children, withEmail };
  }, [validatedReservations]);

  const sejourOptions = useMemo(() => {
    const names = new Set(reservations.map((r) => r.sejour?.name).filter(Boolean));
    return [...names].sort();
  }, [reservations]);

  const filtered = useMemo(() => {
    return reservations.filter((r) => {
      if (activeChannel === "email" && !r.legal?.email) return false;
      if (activeChannel === "sms" && !normalizeSmsPhone(contactPhone(r))) return false;
      if (filterStatus === "validated" && !isValidatedReservation(r)) return false;
      if (filterStatus === "pending" && !isPendingReservation(r)) return false;
      if (filterSejour !== "all" && r.sejour?.name !== filterSejour) return false;
      const week = weekFromStartDate(r.sejour?.startDate);
      if (filterWeek === "august" && !["S3", "S4"].includes(week)) return false;
      if (filterWeek !== "all" && filterWeek !== "august" && week !== filterWeek) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${r.legal?.firstName || ""} ${r.legal?.lastName || ""}`.toLowerCase();
        const email = (r.legal?.email || "").toLowerCase();
        const phone = contactPhone(r).toLowerCase();
        const num = (r.numeroDeReservation || "").toLowerCase();
        const kids = childrenFullNames(r.minor).toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q) && !num.includes(q) && !kids.includes(q)) return false;
      }
      return true;
    });
  }, [activeChannel, reservations, filterSejour, filterStatus, filterWeek, search]);

  const selectedList = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected]
  );

  useEffect(() => {
    const allowed = new Set(filtered.map((r) => r.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  // ── Template ──────────────────────────────────────────────────────────────

  const handleTemplateChange = useCallback((key) => {
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setTemplateKey(key);
    setSubject(tpl.defaultSubject);
    setBody(tpl.defaultBody);
    setMissingDocs(new Set());
    if (key === LATEST_PLACES_TEMPLATE_KEY) {
      setFilterStatus("pending");
      setFilterWeek("all");
    } else {
      setFilterStatus("validated");
    }
  }, []);

  const handleChannelChange = useCallback((channel) => {
    setActiveChannel(channel);
    setSelected(new Set());
    setPreviewOpen(false);
    setSendState("idle");
    setSendProgress({ done: 0, total: 0, errors: [] });
    if (channel === "sms") {
      setFilterStatus("pending");
      setFilterWeek("S4");
      setTemplateKey(LATEST_PLACES_TEMPLATE_KEY);
    } else {
      setFilterStatus("validated");
    }
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

  // ── Variable insertion ────────────────────────────────────────────────────

  const insertVar = useCallback((varName, ref, setter) => {
    const el = ref?.current;
    const token = `{{${varName}}}`;
    if (!el) { setter((prev) => prev + token); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const newVal = el.value.slice(0, start) + token + el.value.slice(end);
    setter(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }, []);

  const handleAttachmentChange = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    let rejected = 0;
    const next = [...attachments];
    let total = next.reduce((sum, file) => sum + Number(file.size || 0), 0);
    files.forEach((file) => {
      const duplicate = next.some((item) =>
        item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
      );
      if (duplicate) return;
      if (total + Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
        rejected += 1;
        return;
      }
      total += Number(file.size || 0);
      next.push(file);
    });

    setAttachments(next);
    event.target.value = "";
    if (rejected > 0) {
      showToast("Pièces jointes limitées à 20 Mo au total par email", "warning");
    }
  }, [attachments, showToast]);

  const removeAttachment = useCallback((index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
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
    return bodyToHtml(resolveVars(body, previewReservation, getExtraVars()));
  }, [previewReservation, body, getExtraVars]);

  const previewSubject = useMemo(() => {
    if (!previewReservation) return "";
    return resolveVars(subject, previewReservation, getExtraVars());
  }, [previewReservation, subject, getExtraVars]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendBatch = useCallback(async () => {
    if (templateKey === LATEST_PLACES_TEMPLATE_KEY && selectedList.some((res) => !isPendingReservation(res))) {
      showToast("Ce modèle est prévu pour les réservations en cours non validées", "error");
      return;
    }
    if (selectedList.length === 0) { showToast("Aucun destinataire sélectionné", "error"); return; }
    if (selectedList.some((res) => !String(res?.legal?.email || "").trim())) {
      showToast("Certains destinataires n'ont pas d'adresse email", "error");
      return;
    }
    if (!subject.trim()) { showToast("L'objet du mail est obligatoire", "error"); return; }

    setSendState("sending");
    setSendProgress({ done: 0, total: selectedList.length, errors: [] });

    const extraVars = getExtraVars();
    const errors = [];

    for (let i = 0; i < selectedList.length; i++) {
      const res = selectedList[i];
      try {
        let reservationForEmail = res;
        if (templateKey === LATEST_PLACES_TEMPLATE_KEY && !res.stripeDepositUrl) {
          if (!res.tokenUnique) {
            throw new Error("Token réservation manquant pour générer le lien Stripe acompte");
          }
          const stripeDepositUrl = await createDepositStripeLink(res);
          reservationForEmail = { ...res, stripeDepositUrl };
          await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, res.id), { stripeDepositUrl });
          setReservations((prev) =>
            prev.map((item) => item.id === res.id ? { ...item, stripeDepositUrl } : item),
          );
        }
        const payload = {
          to: reservationForEmail.legal.email,
          subject: resolveVars(subject, reservationForEmail, extraVars),
          html: bodyToHtml(resolveVars(body, reservationForEmail, extraVars)),
          from_name: sender.name,
          from_email: sender.email,
        };
        const requestOptions = attachments.length > 0
          ? (() => {
              const formData = new FormData();
              Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
              attachments.forEach((file) => formData.append("attachments", file, file.name));
              return { method: "POST", body: formData };
            })()
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            };
        const resp = await fetch("/api/communication/send", {
          ...requestOptions,
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `HTTP ${resp.status}`);
        }
      } catch (e) {
        errors.push({ email: res.legal.email, error: e.message });
      }

      setSendProgress({ done: i + 1, total: selectedList.length, errors: [...errors] });
      if (i < selectedList.length - 1) await new Promise((r) => setTimeout(r, 350));
    }

    setSendState("done");
    if (errors.length === 0) {
      showToast(`${selectedList.length} email(s) envoyé(s) avec succès`, "success");
    } else {
      showToast(`${selectedList.length - errors.length} succès, ${errors.length} erreur(s)`, "error");
    }
  }, [selectedList, templateKey, subject, body, sender, attachments, getExtraVars, showToast]);

  const sendSmsBatch = useCallback(async () => {
    if (selectedList.length === 0) { showToast("Aucun destinataire SMS sÃ©lectionnÃ©", "error"); return; }
    const invalidPhone = selectedList.find((res) => !normalizeSmsPhone(contactPhone(res)));
    if (invalidPhone) {
      showToast("Certains destinataires n'ont pas de mobile valide", "error");
      return;
    }
    if (selectedList.some((res) => weekFromStartDate(res.sejour?.startDate) !== "S4" || !isPendingReservation(res))) {
      showToast("Le SMS de relance est prÃ©vu pour les S4 en cours non validÃ©es", "error");
      return;
    }
    if (!smsSender.trim()) { showToast("L'expÃ©diteur SMS est obligatoire", "error"); return; }
    if (!smsBody.trim()) { showToast("Le texte SMS est obligatoire", "error"); return; }

    setSendState("sending");
    setSendProgress({ done: 0, total: selectedList.length, errors: [] });
    const errors = [];

    for (let i = 0; i < selectedList.length; i++) {
      const res = selectedList[i];
      try {
        const recipient = normalizeSmsPhone(contactPhone(res));
        const content = resolveVars(smsBody, res);
        const resp = await fetch("/api/brevo/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: smsSender.trim(),
            recipient,
            content,
            tag: `relance-s4-${res.numeroDeReservation || res.id}`,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, res.id), {
          smsS4ReminderSent: true,
          smsS4ReminderSentAt: serverTimestamp(),
          smsS4ReminderRecipient: recipient,
          smsS4ReminderText: content,
        });
        setReservations((prev) => prev.map((item) => item.id === res.id ? { ...item, smsS4ReminderSent: true } : item));
      } catch (e) {
        errors.push({ email: `${contactPhone(res)} · ${res.legal?.firstName || ""} ${res.legal?.lastName || ""}`.trim(), error: e.message });
      }
      setSendProgress({ done: i + 1, total: selectedList.length, errors: [...errors] });
      if (i < selectedList.length - 1) await new Promise((r) => setTimeout(r, 350));
    }

    setSendState("done");
    if (errors.length === 0) showToast(`${selectedList.length} SMS envoyÃ©(s) avec succÃ¨s`, "success");
    else showToast(`${selectedList.length - errors.length} succÃ¨s, ${errors.length} erreur(s)`, "error");
  }, [selectedList, smsSender, smsBody, showToast]);

  const sendSmsTest = useCallback(async () => {
    if (!smsSender.trim()) { showToast("L'expÃ©diteur SMS est obligatoire", "error"); return; }
    if (!smsBody.trim()) { showToast("Le texte SMS est obligatoire", "error"); return; }
    const sample = selectedList[0] || filtered[0] || {
      numeroDeReservation: "TEST",
      legal: { firstName: "Test", lastName: "ColoCrew" },
      minor: { children: [{ firstName: "Test", lastName: "" }] },
      sejour: { name: "My Creative Surf Camp", startDate: "2026-08-17", endDate: "2026-08-28" },
    };
    setSmsTestSending(true);
    try {
      const resp = await fetch("/api/brevo/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: smsSender.trim(),
          recipient: SMS_TEST_PHONE,
          content: `[TEST] ${resolveVars(smsBody, sample)}`,
          tag: "test-relance-s4",
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      showToast(`SMS test envoyÃ© au ${SMS_TEST_PHONE}`, "success");
    } catch (error) {
      showToast(`Erreur test SMS : ${error.message}`, "error");
    } finally {
      setSmsTestSending(false);
    }
  }, [filtered, selectedList, smsSender, smsBody, showToast]);

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
          {validStats.children} enfants validés · {validStats.files} dossiers · {validStats.withEmail} familles avec email · {filtered.length} visible(s) · {selectedList.length} sélectionnée(s)
        </p>
      </div>

      {/* ── Body ── */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => handleChannelChange("email")} style={{ ...channelTabStyle, ...(activeChannel === "email" ? channelTabActiveStyle : {}) }}>
            Emails
          </button>
          <button type="button" onClick={() => handleChannelChange("sms")} style={{ ...channelTabStyle, ...(activeChannel === "sms" ? channelTabActiveStyle : {}) }}>
            SMS relance S4
          </button>
        </div>

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
                <option value="august">Août S3 + S4</option>
                {Object.entries(WEEK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
              {STATUS_FILTERS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div style={{ padding: "8px 10px", borderRadius: 8, background: "#ecfdf5", color: "#047857", fontSize: 12, fontWeight: 700, border: "1px solid #bbf7d0" }}>
              {filterStatus === "pending"
                ? "Réservations en cours non validées"
                : filterStatus === "all"
                  ? "Tous les statuts avec email"
                  : "Réservations validées avec email"}
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
                        {activeChannel === "sms" ? normalizeSmsPhone(contactPhone(res)) : res.legal?.email}
                      </div>
                    </div>

                    {/* Aperçu */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const idx = selectedList.findIndex((r) => r.id === res.id);
                        setPreviewIdx(idx >= 0 ? idx : 0);
                        if (!selected.has(res.id)) { toggleSelect(res.id); setPreviewIdx(0); }
                        setPreviewOpen(true);
                      }}
                      title="Aperçu email"
                      style={{ display: activeChannel === "sms" ? "none" : undefined, background: "none", border: "none", cursor: "pointer", color: "#c4b5fd", padding: 0, flexShrink: 0, paddingTop: 3 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right : composer ── */}
        {sendState === "done" ? (
          <SendResultsPanel progress={sendProgress} onReset={resetSend} channel={activeChannel} />
        ) : activeChannel === "sms" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 8px" }}>
              <div style={{ marginBottom: 18, padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
                <div style={{ ...labelStyle, color: "#047857", marginBottom: 6 }}>Ciblage SMS</div>
                <p style={{ margin: 0, fontSize: 12, color: "#047857", lineHeight: 1.5 }}>
                  Mode prÃ©vu pour les rÃ©servations S4 en cours non validÃ©es avec mobile valide. Pour recevoir une rÃ©ponse directe au SMS, l'expÃ©diteur Brevo doit permettre les rÃ©ponses ; un Sender ID texte comme "ColoCrew" peut ne pas recevoir les retours.
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>ExpÃ©diteur SMS</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={smsSender}
                    onChange={(e) => setSmsSender(e.target.value)}
                    maxLength={16}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="ColoCrew ou numÃ©ro compatible rÃ©ponse"
                  />
                  <button
                    type="button"
                    onClick={sendSmsTest}
                    disabled={smsTestSending}
                    style={{ ...btnSmallStyle, flexShrink: 0, background: smsTestSending ? "#f1f5f9" : "#eefcf3", color: smsTestSending ? "#94a3b8" : "#15803d", borderColor: smsTestSending ? "#e2e8f0" : "#bbf7d0", cursor: smsTestSending ? "not-allowed" : "pointer" }}
                  >
                    {smsTestSending ? "Test..." : `Test ${SMS_TEST_PHONE}`}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Message SMS</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
                  {VAR_BADGES_BODY.filter((v) => ["prenom_parent", "prenom_enfants", "nom_sejour", "semaine", "numero_reservation"].includes(v.var)).map((v) => (
                    <VarBadge key={v.var} label={v.label} onClick={() => insertVar(v.var, smsBodyRef, setSmsBody)} />
                  ))}
                </div>
                <textarea
                  ref={smsBodyRef}
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  rows={7}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "'Courier New', Courier, monospace", fontSize: 13, lineHeight: 1.55 }}
                />
                <p style={{ margin: "6px 0 0", fontSize: 11, color: smsBody.length > 160 ? "#ea580c" : "#94a3b8" }}>
                  {smsBody.length} caractÃ¨res avant personnalisation. Un SMS long peut consommer plusieurs crÃ©dits.
                </p>
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                <div style={{ padding: "10px 14px", background: "#f8fafc", fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                  AperÃ§u premier destinataire
                </div>
                <div style={{ padding: 14, fontSize: 14, lineHeight: 1.6, color: "#1e1040", whiteSpace: "pre-wrap" }}>
                  {selectedList[0] ? resolveVars(smsBody, selectedList[0]) : "SÃ©lectionnez au moins une famille S4 non validÃ©e."}
                </div>
              </div>
            </div>

            <div style={{ padding: "12px 28px", borderTop: "1px solid #f0e8f5", background: "#fff", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              {sendState === "sending" ? (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: 5 }}>
                    Envoi SMS en coursâ€¦ {sendProgress.done}/{sendProgress.total}
                    {sendProgress.errors.length > 0 && <span style={{ color: "#ef4444", marginLeft: 8 }}>Â· {sendProgress.errors.length} erreur(s)</span>}
                  </div>
                  <div style={{ height: 6, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#16a34a", borderRadius: 999, width: `${(sendProgress.done / sendProgress.total) * 100}%`, transition: "width 0.3s ease" }} />
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: "#64748b", flex: 1 }}>
                    {selectedList.length === 0 ? "SÃ©lectionnez les familles S4 Ã  relancer" : `${selectedList.length} SMS prÃªt(s) Ã  envoyer`}
                  </span>
                  <button
                    type="button"
                    disabled={selectedList.length === 0}
                    onClick={sendSmsBatch}
                    style={{ ...btnStyle, background: selectedList.length === 0 ? "#f1f5f9" : "#16a34a", color: selectedList.length === 0 ? "#94a3b8" : "#fff", cursor: selectedList.length === 0 ? "not-allowed" : "pointer" }}
                  >
                    Envoyer SMS{selectedList.length > 0 ? ` (${selectedList.length})` : ""}
                  </button>
                </>
              )}
            </div>
          </div>
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

              {templateKey === LATEST_PLACES_TEMPLATE_KEY && (
                <div style={{ marginBottom: 20, padding: 16, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
                  <div style={{ ...labelStyle, color: "#c2410c", marginBottom: 6 }}>Ciblage dernières places août</div>
                  <p style={{ margin: 0, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
                    Ce modèle sélectionne toutes les réservations en cours non validées avec email. Le texte reste modifiable avant envoi pour personnaliser les familles.
                  </p>
                </div>
              )}

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

              {/* Pièces jointes */}
              <div style={{ marginTop: 16, marginBottom: 8 }}>
                <label style={labelStyle}>Pièces jointes</label>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  onChange={handleAttachmentChange}
                  style={{ display: "none" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    style={{ ...btnSmallStyle, padding: "7px 12px", background: "#f5f0ff", color: "#7c3aed", border: "1.5px solid #d4c0e8" }}
                  >
                    + Ajouter des fichiers
                  </button>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {attachments.length === 0
                      ? "Aucune pièce jointe"
                      : `${attachments.length} fichier(s) · ${formatFileSize(attachments.reduce((sum, file) => sum + Number(file.size || 0), 0))}`}
                  </span>
                </div>
                {attachments.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                    {attachments.map((file, index) => (
                      <div key={`${file.name}-${file.size}-${file.lastModified}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: "#1e1040" }}>
                          {file.name}
                        </span>
                        <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          title="Retirer la pièce jointe"
                          style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontWeight: 900, flexShrink: 0 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#94a3b8" }}>
                  Les fichiers seront ajoutés à chaque email envoyé. Limite : 20 Mo au total par email.
                </p>
              </div>
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
                    {selectedList.length === 0
                      ? "Sélectionnez des destinataires dans la liste"
                      : `${selectedList.length} destinataire(s) sélectionné(s)`}
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
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0e8f5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e1040" }}>Aperçu de l&apos;email</div>
                <div style={{ fontSize: 12, color: "#7c3aed", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {previewReservation.legal?.firstName} {previewReservation.legal?.lastName} · {previewReservation.legal?.email}
                </div>
              </div>
              {selectedList.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button type="button" onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))} disabled={previewIdx <= 0} style={{ ...btnSmallStyle, padding: "4px 8px", opacity: previewIdx <= 0 ? 0.4 : 1 }}>←</button>
                  <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{previewIdx + 1} / {selectedList.length}</span>
                  <button type="button" onClick={() => setPreviewIdx((i) => Math.min(selectedList.length - 1, i + 1))} disabled={previewIdx >= selectedList.length - 1} style={{ ...btnSmallStyle, padding: "4px 8px", opacity: previewIdx >= selectedList.length - 1 ? 0.4 : 1 }}>→</button>
                </div>
              )}
              <button type="button" onClick={() => setPreviewOpen(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontWeight: 700, color: "#64748b", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ padding: "8px 18px", background: "#fafafa", borderBottom: "1px solid #f0e8f5" }}>
              <span style={{ fontSize: 12, color: "#374151" }}><strong>Objet :</strong> {previewSubject}</span>
              {attachments.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {attachments.map((file) => (
                    <span key={`${file.name}-${file.size}-${file.lastModified}`} style={{ padding: "3px 7px", borderRadius: 999, background: "#f5f0ff", color: "#7c3aed", fontSize: 11, fontWeight: 700 }}>
                      {file.name} · {formatFileSize(file.size)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", background: "#f8f9fa" }}>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid #f0e8f5", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setPreviewOpen(false)} style={{ ...btnStyle, background: "#f1f5f9", color: "#64748b" }}>Fermer</button>
              <button type="button" onClick={() => { setPreviewOpen(false); sendBatch(); }} style={{ ...btnStyle, background: "#B8336A", color: "#fff" }}>
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
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 32,
  cursor: "pointer",
};

const btnStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.15s",
};

const btnSmallStyle = {
  ...btnStyle,
  padding: "6px 12px",
  fontSize: 12,
  background: "#f5f0ff",
  color: "#7c3aed",
  border: "1.5px solid #d4c0e8",
};

const channelTabStyle = {
  border: "1.5px solid #e5e7eb",
  borderRadius: 999,
  background: "#fff",
  color: "#64748b",
  padding: "7px 14px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const channelTabActiveStyle = {
  borderColor: "#7c3aed",
  background: "#7c3aed",
  color: "#fff",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 7,
};
