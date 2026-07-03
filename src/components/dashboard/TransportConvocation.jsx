"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
const STAGE_QUAI_RDV = "Rendez-vous sur le quai — l’animateur·ice vous contactera";
const STAGE_QUAI_DETAILS = "La voie, la voiture et l’heure précise seront communiquées par l’animateur·ice.";

// ─── Utilities ────────────────────────────────────────────────────────────────

function weekFromStartDate(iso) {
  return WEEK_MAP[String(iso || "").slice(0, 10)] || "";
}

function normalizeCity(v) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function isRoadMode(value) {
  const mode = normalizeCity(value);
  return mode.includes("bus") || mode.includes("autocar") || mode.includes("minibus");
}

function minutesFromTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function legacyConvocationReminderItems({ departureTime, returnDepartureTime, returnArrivalTime }) {
  const departureMinutes = minutesFromTime(departureTime);
  const returnDepartureMinutes = minutesFromTime(returnDepartureTime);
  const returnArrivalMinutes = minutesFromTime(returnArrivalTime);
  const needsLunch = (departureMinutes !== null && departureMinutes < 12 * 60)
    || (returnDepartureMinutes !== null && returnDepartureMinutes < 12 * 60);
  const needsDinner = returnArrivalMinutes !== null && returnArrivalMinutes >= 19 * 60;
  return [
    needsLunch ? "🥪 Pensez à prévoir un <strong>pique-nique pour le déjeuner</strong>." : null,
    needsDinner ? "🍽️ Un <strong>repas sera prévu sur place</strong>, mais l'arrivée étant tardive, pensez à prévoir un pique-nique ou un encas pour le dîner." : null,
    "💧 Merci de prévoir <strong>de l'eau et un goûter</strong> pour le trajet.",
    "⏱️ Le rendez-vous est fixé <strong>au moins 45 minutes avant le départ du train</strong>.",
    "💊 Si votre enfant a un traitement médical, merci de prévoir les <strong>médicaments dans leur emballage d'origine avec l'ordonnance</strong>.",
  ].filter(Boolean);
}

function legacyReminderHtml(items) {
  return `<ul style="margin:12px 0 0;padding:0;list-style:none;font-size:14px;color:#374151;line-height:1.75;">
    ${items.map((item) => `<li style="margin:0 0 8px;padding-left:18px;position:relative;"><span style="position:absolute;left:0;color:#B8336A;">●</span>${item}</li>`).join("")}
  </ul>`;
}

function transportFamilyActionCities(transport) {
  const cities = new Set();
  const isReturn = transport.direction === "retour";
  for (const seg of [...(transport.segments || []), ...(transport.branches || [])]) {
    const endpoint = isReturn ? seg.to : seg.from;
    if (endpoint) cities.add(normalizeCity(endpoint));
    for (const stop of seg.stops || []) {
      // Sur un trajet de liaison retour, une étape sert à récupérer un groupe au centre,
      // pas à remettre un enfant à sa famille.
      if (stop.city && !(isReturn && transport.sharedConnection)) cities.add(normalizeCity(stop.city));
    }
  }
  return cities;
}

function getMeetingInfo(transport, city) {
  if (!transport) return null;
  const nc = normalizeCity(city);
  const isReturn = transport.direction === "retour";
  for (const seg of [...(transport.segments || []), ...(transport.branches || [])]) {
    const boardCity = isReturn ? seg.to : seg.from;
    if (normalizeCity(boardCity) === nc) {
      return {
        meetingPoint:  isReturn ? `À la descente à ${boardCity}` : seg.meetingPoint || transport.meetingPoint || boardCity || "",
        meetingTime:   isReturn ? seg.arrivalTime || transport.arrivalTime || "" : seg.meetingTime || transport.meetingTime || "",
        platform:      seg.platform      || transport.platform      || "",
        departureTime: seg.departureTime || transport.departureTime || "",
        arrivalTime:   seg.arrivalTime   || transport.arrivalTime || "",
        trainType:     transport.trainType   || "",
        trainNumber:   transport.trainNumber || seg.number || "",
        date:          transport.date || "",
      };
    }
    for (const stop of seg.stops || []) {
      if (normalizeCity(stop.city) === nc) {
        const isRailStage = !isRoadMode(seg.mode || seg.trainType);
        return {
          meetingPoint:  isReturn ? `À la descente du quai à ${stop.city}` : isRailStage ? STAGE_QUAI_RDV : stop.meetingPoint || seg.meetingPoint || transport.meetingPoint || stop.city || "",
          meetingTime:   isReturn ? stop.arrivalTime || "" : stop.meetingTime || "",
          platform:      stop.platform      || seg.platform      || transport.platform      || "",
          departureTime: stop.departureTime || seg.departureTime || transport.departureTime || "",
          arrivalTime:   stop.arrivalTime || "",
          trainType:     stop.mode || seg.mode || transport.trainType || "",
          trainNumber:   transport.trainNumber || seg.number || "",
          date:          transport.date || "",
          isStageStop:   isRailStage && !isReturn,
        };
      }
    }
  }
  return {
    meetingPoint:  isReturn ? `À la descente à ${city || transport.arrivalCity || "l'arrivée"}` : transport.meetingPoint || transport.departureCity || "",
    meetingTime:   isReturn ? transport.arrivalTime || "" : transport.meetingTime || "",
    platform:      transport.platform      || "",
    departureTime: transport.departureTime || "",
    arrivalTime:   transport.arrivalTime || "",
    trainType:     transport.trainType     || "",
    trainNumber:   transport.trainNumber   || "",
    date:          transport.date          || "",
  };
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T00:00:00`);
  return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function fmtDateLong(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T00:00:00`);
  return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function childrenNames(minor) {
  const children = Array.isArray(minor?.children) ? minor.children : [];
  return children.map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean);
}

function childrenFirstNames(minor) {
  const children = Array.isArray(minor?.children) ? minor.children : [];
  return children.map((c) => c.firstName || "").filter(Boolean).join(", ");
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildConvocationHtml(reservation, allerTransport, retourTransport, overrides = {}, animInfo = {}) {
  const legal   = reservation.legal   || {};
  const minor   = reservation.minor   || {};
  const sejour  = reservation.sejour  || {};
  const tpt     = reservation.transport || {};
  const children = Array.isArray(minor.children) ? minor.children : [];

  const allerCity  = tpt.departureCity || "";
  const retourCity = tpt.returnCity    || "";

  const allerMBase  = getMeetingInfo(allerTransport,  allerCity);
  const retourMBase = getMeetingInfo(retourTransport, retourCity);

  const allerM  = allerMBase  ? { ...allerMBase,  meetingTime: overrides.allerMeetingTime  ?? allerMBase.meetingTime  } : null;
  const retourM = retourMBase ? { ...retourMBase, meetingTime: overrides.retourMeetingTime ?? retourMBase.meetingTime } : null;

  const allNames   = childrenNames(minor);
  const firstNames = children.map((c) => c.firstName || "").filter(Boolean);
  const firstName  = firstNames[0] || legal.firstName || "votre enfant";
  const headerName = allNames.join(", ") || `${legal.firstName || ""} ${legal.lastName || ""}`.trim();
  const verb       = children.length > 1 ? "sont inscrits" : "est inscrit(e)";

  const TBC = `<span style="color:#94a3b8;font-style:italic;">À confirmer.</span>`;

  const legacyReminderItems = legacyConvocationReminderItems({
    departureTime: allerM?.departureTime,
    returnDepartureTime: retourM?.departureTime,
    returnArrivalTime: retourTransport?.arrivalTime,
  });

  const mkRdv = (m, city) => m?.isStageStop
    ? `<strong>${STAGE_QUAI_RDV}</strong><br><span style="font-size:12px;color:#64748b;">${STAGE_QUAI_DETAILS}</span>`
    : m?.meetingPoint
    ? `<strong>${m.meetingPoint}</strong>${m.platform ? `<br><span style="font-size:12px;color:#64748b;">Voie / quai ${m.platform}</span>` : ""}`
    : city ? `<strong>${city}</strong>` : TBC;

  const mkDateTime = (m, fallbackDate, accentColor) => {
    const d = m?.date || fallbackDate;
    return d
      ? `<strong>${fmtDateLong(d)}</strong>${m?.meetingTime ? `<br><span style="color:${accentColor};font-weight:700;">RDV à ${m.meetingTime}</span>` : ""}`
      : TBC;
  };

  const mkTrain = (m, isReturn = false) => {
    const label = m?.trainType && m?.trainNumber ? `${m.trainType} n°${m.trainNumber}` : (m?.trainNumber ? `Train n°${m.trainNumber}` : "");
    const schedule = isReturn
      ? (m?.arrivalTime || m?.meetingTime ? `Arrivée prévue à <strong>${m.arrivalTime || m.meetingTime}</strong>` : "")
      : (m?.departureTime ? `Départ à <strong>${m.departureTime}</strong>` : "");
    return [label, schedule].filter(Boolean).join("<br>") || TBC;
  };

  const td0 = (last) => `style="padding:13px 16px;font-weight:700;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;background:#fafafa;border-right:1px solid #e5e7eb;${last ? "" : "border-bottom:1px solid #f0f0f0;"}width:27%;vertical-align:top;"`;
  const td1 = (last) => `style="padding:13px 16px;border-right:1px solid #f0f0f0;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;
  const td2 = (last) => `style="padding:13px 16px;${last ? "" : "border-bottom:1px solid #f0f0f0;"}vertical-align:top;line-height:1.6;font-size:14px;color:#1e1040;"`;

  const logoUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://colocrew.com') + '/LogoColoCrew.png';
  const animBlock = animInfo?.name ? `
  <div style="margin:0 28px 20px;padding:14px 20px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Votre animateur·trice référent·e</p>
    <p style="margin:0;font-size:15px;font-weight:800;color:#1e1040;">${animInfo.name}</p>
    ${animInfo.phone ? `<p style="margin:4px 0 0;font-size:14px;color:#374151;">📞 ${animInfo.phone}</p>` : ""}
  </div>` : `
  <div style="margin:0 28px 20px;padding:14px 20px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Votre animateur·trice référent·e</p>
    <p style="margin:0;font-size:14px;font-weight:700;color:#374151;line-height:1.6;">Les coordonnées de l’animateur·ice vous seront communiquées prochainement.</p>
  </div>`;

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
      <td style="padding:14px 28px;vertical-align:middle;">
        <img src="${logoUrl}" alt="ColoCrew" style="height:48px;width:auto;display:block;" onerror="this.style.display='none'" />
      </td>
      <td style="padding:14px 28px;text-align:right;vertical-align:middle;font-size:12px;color:#64748b;line-height:1.9;">
        <div>📧 info@colocrew.com</div>
        <div>📞 01 84 21 02 30</div>
        <div>🌐 colocrew.com</div>
      </td>
    </tr>
  </table>

  <!-- TITLE -->
  <div style="padding:24px 28px 8px;">
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#B8336A;">
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

  <!-- TABLE -->
  <div style="padding:0 28px 20px;">
    <table style="width:100%;border-collapse:collapse;border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead>
        <tr>
          <td style="padding:11px 16px;background:#f8f9fa;border-right:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;width:27%;"></td>
          <th style="padding:12px 16px;background:#f0fdf4;color:#16a34a;font-weight:900;font-size:14px;text-align:center;border-right:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;">↑ ALLER</th>
          <th style="padding:12px 16px;background:#fff7ed;color:#ea580c;font-weight:900;font-size:14px;text-align:center;border-left:1px solid #e5e7eb;border-bottom:2px solid #e5e7eb;">↓ RETOUR</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td ${td0(false)}>Lieu de rendez-vous</td>
          <td ${td1(false)}>${mkRdv(allerM, allerCity)}</td>
          <td ${td2(false)}>${mkRdv(retourM, retourCity)}</td>
        </tr>
        <tr>
          <td ${td0(false)}>Date &amp; heure de rendez-vous</td>
          <td ${td1(false)}>${mkDateTime(allerM, sejour.startDate, "#16a34a")}</td>
          <td ${td2(false)}>${mkDateTime(retourM, sejour.endDate, "#ea580c")}</td>
        </tr>
        <tr>
          <td ${td0(true)}>Informations complémentaires</td>
          <td ${td1(true)}>${mkTrain(allerM, false)}</td>
          <td ${td2(true)}>${mkTrain(retourM, true)}</td>
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
      <li>Un animateur ou une animatrice attendra les enfants au point de rendez-vous, reconnaissable à son <strong>t-shirt ColoCrew</strong>.</li>
      <li>Les responsables légaux sont invités à <strong>se présenter à l'animateur ou animatrice,</strong> disponible pour répondre à vos questions.</li>
      <li>Si votre enfant se rend seul(e) au point de rendez-vous, merci de nous fournir <strong>la décharge de responsabilité</strong> (ci-jointe) qu'il/elle remettra directement à l'animateur ou animatrice.</li>
      <li>L'animateur ou animatrice prendra ensuite en charge le groupe et assurera un <strong>trajet encadré et sécurisé</strong> jusqu'au lieu de séjour.</li>
      <li>Pour le retour, si l'enfant doit rentrer seul(e) ou être récupéré(e) par une tierce personne, merci de nous fournir <strong>la décharge de responsabilité</strong> (ci-jointe) qu'il/elle remettra directement à l'animateur ou animatrice.</li>
    </ul>
    ${legacyReminderHtml(legacyReminderItems)}
  </div>

  <!-- ANIMATEUR -->
  ${animBlock}

  <!-- FOOTER -->
  <div style="border-top:2px solid #f5f0ff;padding:16px 28px;text-align:center;background:#fdf8fc;">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">Association ColoCrew — SIRET : 9 3 2 1 7 1 4 3 2 0 0 0 1 0</p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Suivez-nous sur les réseaux : @_colocrew/ColoCrew</p>
  </div>

</div>
</body>
</html>`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransportConvocation() {
  const { showToast } = useToast();

  const [transports, setTransports]     = useState([]);
  const [reservations, setReservations] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading]           = useState(true);

  // Preview modal
  const [previewItem, setPreviewItem]   = useState(null); // { res, allerT, retourT }
  const [editSubject, setEditSubject]   = useState("");
  const [editAllerTime, setEditAllerTime]   = useState("");
  const [editRetourTime, setEditRetourTime] = useState("");
  const [sendingId, setSendingId]       = useState(null);

  // Global send all
  const [sendingAll, setSendingAll]     = useState(false);
  const [progress, setProgress]         = useState({ done: 0, total: 0, errors: [] });

  // Filter
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "pending" | "sent"

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, COLLECTIONS.TRANSPORTS),   orderBy("date",      "asc"))),
      getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), orderBy("createdAt", "desc"))),
      getDocs(collection(db, COLLECTIONS.STAFF_MEMBERS)),
    ])
      .then(([tSnap, rSnap, staffSnap]) => {
        setTransports(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setReservations(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setStaffMembers(staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => showToast("Erreur de chargement", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const getAnimForTransport = useCallback((transport) => {
    const s = transport?.staff?.[0];
    if (!s) return {};
    const member = staffMembers.find((m) => m.id === s.memberId);
    return {
      name: member?.name || s.name || "",
      phone: member?.phone || s.phone || "",
    };
  }, [staffMembers]);

  // ── Grouping ──────────────────────────────────────────────────────────────
  // One group per aller transport, with matched reservations

  const groups = useMemo(() => {
    const allerTransports = transports
      .filter((t) => t.direction === "aller")
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

    const assignedAller = (reservation) => {
      const week = weekFromStartDate(reservation.sejour?.startDate);
      const candidates = allerTransports.filter((transport) => transport.week === week);
      const city = normalizeCity(reservation.transport?.departureCity || "");
      return candidates.find((transport) =>
        (transport.passengers || []).some((passenger) => passenger.reservationId === reservation.id)
        && transportFamilyActionCities(transport).has(city),
      ) || candidates.find((transport) =>
        transportFamilyActionCities(transport).has(city),
      ) || null;
    };

    return allerTransports.map((allerT) => {
      const matched = reservations.filter((r) => {
        if (!r.legal?.email) return false;
        return assignedAller(r)?.id === allerT.id;
      });

      return { allerT, reservations: matched };
    }).filter((g) => g.reservations.length > 0);
  }, [transports, reservations]);

  const findRetourTransport = useCallback((reservation) => {
    const week = weekFromStartDate(reservation.sejour?.startDate);
    const candidates = transports.filter((transport) => transport.week === week && transport.direction === "retour");
    const city = normalizeCity(reservation.transport?.returnCity || "");
    return candidates.find((transport) =>
      (transport.passengers || []).some((passenger) => passenger.reservationId === reservation.id)
      && transportFamilyActionCities(transport).has(city),
    ) || candidates.find((transport) =>
      transportFamilyActionCities(transport).has(city),
    ) || null;
  }, [transports]);

  const totalPending = useMemo(
    () => groups.reduce((acc, g) => acc + g.reservations.filter((r) => !r.convocationSent).length, 0),
    [groups]
  );

  // ── Send helpers ──────────────────────────────────────────────────────────

  const markSent = useCallback(async (resId) => {
    await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, resId), {
      convocationSent: true,
      convocationSentAt: serverTimestamp(),
    });
    setReservations((prev) => prev.map((r) => r.id === resId ? { ...r, convocationSent: true } : r));
  }, []);

  const markUnsent = useCallback(async (resId) => {
    await updateDoc(doc(db, COLLECTIONS.RESERVATIONS, resId), {
      convocationSent: false,
      convocationSentAt: null,
    });
    setReservations((prev) => prev.map((r) => r.id === resId ? { ...r, convocationSent: false } : r));
  }, []);

  const sendOne = useCallback(async (res, allerT, retourT, subject, overrides = {}) => {
    const animInfo = getAnimForTransport(allerT);
    const html = buildConvocationHtml(res, allerT, retourT, overrides, animInfo);
    const resp = await fetch("/api/communication/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: res.legal.email,
        subject: subject || `ColoCrew — Convocation de transport — ${res.sejour?.name || "séjour"}`,
        html,
        from_name: "ColoCrew",
        from_email: "contact@colocrew.com",
        includeDecharge: true,
      }),
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error(t || `HTTP ${resp.status}`); }
    await markSent(res.id);
  }, [markSent, getAnimForTransport]);

  const handleSendFromModal = useCallback(async () => {
    if (!previewItem) return;
    setSendingId(previewItem.res.id);
    try {
      await sendOne(previewItem.res, previewItem.allerT, previewItem.retourT, editSubject, timeOverrides);
      showToast(`Convocation envoyée à ${previewItem.res.legal.email}`, "success");
      setPreviewItem(null);
    } catch (e) {
      showToast(`Erreur : ${e.message}`, "error");
    } finally {
      setSendingId(null);
    }
  }, [previewItem, editSubject, timeOverrides, sendOne, showToast]);

  const handleSendAll = useCallback(async () => {
    const toSend = groups.flatMap((g) =>
      g.reservations
        .filter((r) => !r.convocationSent)
        .map((r) => ({ res: r, allerT: g.allerT, retourT: findRetourTransport(r) }))
    );
    if (toSend.length === 0) { showToast("Toutes les convocations ont déjà été envoyées", "info"); return; }

    setSendingAll(true);
    setProgress({ done: 0, total: toSend.length, errors: [] });
    const errors = [];

    for (let i = 0; i < toSend.length; i++) {
      const { res, allerT, retourT } = toSend[i];
      try {
        await sendOne(res, allerT, retourT);
      } catch (e) {
        errors.push({ email: res.legal.email, error: e.message });
      }
      setProgress({ done: i + 1, total: toSend.length, errors: [...errors] });
      if (i < toSend.length - 1) await new Promise((r) => setTimeout(r, 350));
    }

    setSendingAll(false);
    if (errors.length === 0) {
      showToast(`${toSend.length} convocation(s) envoyée(s)`, "success");
    } else {
      showToast(`${toSend.length - errors.length} succès · ${errors.length} erreur(s)`, "error");
    }
  }, [groups, findRetourTransport, sendOne, showToast]);

  const openPreview = useCallback((res, allerT, retourT) => {
    setEditSubject(`ColoCrew — Convocation de transport — ${res.sejour?.name || "séjour"}`);
    const allerCity  = res.transport?.departureCity || "";
    const retourCity = res.transport?.returnCity    || "";
    setEditAllerTime(getMeetingInfo(allerT, allerCity)?.meetingTime  || "");
    setEditRetourTime(getMeetingInfo(retourT, retourCity)?.meetingTime || "");
    setPreviewItem({ res, allerT, retourT });
  }, []);

  const timeOverrides = useMemo(() => ({
    allerMeetingTime:  editAllerTime  || undefined,
    retourMeetingTime: editRetourTime || undefined,
  }), [editAllerTime, editRetourTime]);

  const handleDownloadPdf = useCallback(() => {
    if (!previewItem) return;
    const animInfo = getAnimForTransport(previewItem.allerT);
    const html = buildConvocationHtml(previewItem.res, previewItem.allerT, previewItem.retourT, timeOverrides, animInfo);
    const printHtml = html.replace(
      "</head>",
      `<style>@media print{body{background:#fff!important;padding:0!important;}@page{margin:10mm;}}</style></head>`
    );
    const blob = new Blob([printHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "width=900,height=760");
    if (!win) { URL.revokeObjectURL(url); showToast("Le navigateur a bloqué l'ouverture du document", "warning"); return; }
    win.focus();
    setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 800);
  }, [previewItem, timeOverrides, showToast, getAnimForTransport]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320, color: "#94a3b8", fontSize: 14 }}>
        Chargement des transports et réservations…
      </div>
    );
  }

  const filteredGroups = groups.map((g) => ({
    ...g,
    reservations: g.reservations.filter((r) => {
      if (filterStatus === "sent")    return  r.convocationSent;
      if (filterStatus === "pending") return !r.convocationSent;
      return true;
    }),
  })).filter((g) => g.reservations.length > 0);

  return (
    <div className="res-page">

      {/* ── Header ── */}
      <div className="res-page-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="res-page-title">Convocations transport</h1>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#94a3b8" }}>
            {groups.reduce((a, g) => a + g.reservations.length, 0)} famille(s) ·{" "}
            <span style={{ color: totalPending > 0 ? "#ef4444" : "#16a34a", fontWeight: 700 }}>
              {totalPending} non envoyée(s)
            </span>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Filtre */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={selectStyle}
          >
            <option value="all">Toutes</option>
            <option value="pending">Non envoyées</option>
            <option value="sent">Envoyées</option>
          </select>

          {/* Envoyer tout */}
          {sendingAll ? (
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
                Envoi {progress.done}/{progress.total}
                {progress.errors.length > 0 && <span style={{ color: "#ef4444", marginLeft: 6 }}>· {progress.errors.length} erreur(s)</span>}
              </div>
              <div style={{ height: 5, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#B8336A", borderRadius: 999, width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.3s" }} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSendAll}
              disabled={totalPending === 0}
              style={{
                ...btnStyle,
                background: totalPending === 0 ? "#f1f5f9" : "#B8336A",
                color: totalPending === 0 ? "#94a3b8" : "#fff",
                cursor: totalPending === 0 ? "not-allowed" : "pointer",
                boxShadow: totalPending > 0 ? "0 4px 12px rgba(184,51,106,0.25)" : "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Envoyer tout ({totalPending} non envoyée{totalPending > 1 ? "s" : ""})
            </button>
          )}
        </div>
      </div>

      {/* ── Groups ── */}
      {filteredGroups.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8", fontSize: 14 }}>
          {filterStatus === "all"
            ? "Aucun trajet transport avec des familles correspondantes."
            : filterStatus === "sent"
              ? "Aucune convocation envoyée pour le moment."
              : "Toutes les convocations ont été envoyées !"}
        </div>
      )}

      {filteredGroups.map(({ allerT, reservations: rows }) => {
        const sentCount    = rows.filter((r) => r.convocationSent).length;
        const pendingCount = rows.length - sentCount;

        return (
          <section key={allerT.id} style={{ marginBottom: 28 }}>
            {/* Group header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
              background: "#1e1040", borderRadius: "10px 10px 0 0",
            }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#fff", background: "#B8336A", borderRadius: 6, padding: "2px 8px" }}>
                {allerT.week || "—"}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", flex: 1 }}>
                ↑ {allerT.departureCity || "Départ"} → {allerT.arrivalCity || "Arrivée"}
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {fmtDate(allerT.date)}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                background: pendingCount > 0 ? "#fef2f2" : "#f0fdf4",
                color: pendingCount > 0 ? "#ef4444" : "#16a34a",
              }}>
                {sentCount}/{rows.length} envoyées
              </span>
            </div>

            {/* Table */}
            <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    <th style={thStyle}>Famille</th>
                    <th style={thStyle}>Enfants</th>
                    <th style={thStyle}>Séjour</th>
                    <th style={thStyle}>Ville de convocation</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Convoqué</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((res, idx) => {
                    const allerCity  = res.transport?.departureCity || "";
                    const retourT    = findRetourTransport(res);
                    const meeting    = getMeetingInfo(allerT, allerCity);
                    const rdvLabel   = meeting?.meetingPoint || allerCity || "—";
                    const kids       = childrenNames(res.minor);
                    const isSending  = sendingId === res.id;
                    const sent       = Boolean(res.convocationSent);

                    return (
                      <tr
                        key={res.id}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#fdfcff",
                          borderTop: "1px solid #f0f0f0",
                        }}
                      >
                        {/* Famille */}
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: "#1e1040" }}>
                            {res.legal?.firstName} {res.legal?.lastName}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{res.legal?.email}</div>
                        </td>

                        {/* Enfants */}
                        <td style={tdStyle}>
                          <div style={{ color: "#7c3aed", fontWeight: 600 }}>
                            {kids.join(", ") || childrenFirstNames(res.minor) || "—"}
                          </div>
                        </td>

                        {/* Séjour */}
                        <td style={tdStyle}>
                          <div style={{ color: "#374151" }}>{res.sejour?.name || "—"}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            {res.numeroDeReservation || ""}
                          </div>
                        </td>

                        {/* Ville RDV */}
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: "#1e1040" }}>{rdvLabel}</div>
                          {meeting?.meetingTime && (
                            <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>RDV {meeting.meetingTime}</div>
                          )}
                        </td>

                        {/* Checkbox convoqué */}
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => sent ? markUnsent(res.id) : markSent(res.id)}
                            title={sent ? "Cliquez pour annuler" : "Cliquez pour marquer envoyée"}
                            style={{
                              width: 28, height: 28, borderRadius: 6,
                              border: `2px solid ${sent ? "#86efac" : "#d1d5db"}`,
                              background: sent ? "#dcfce7" : "#fff",
                              cursor: "pointer",
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            {sent && (
                              <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                                <polyline points="2,6 5,9 10,3" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => openPreview(res, allerT, retourT)}
                              style={{ ...btnSmallStyle, gap: 5 }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                              </svg>
                              Aperçu
                            </button>
                            <button
                              type="button"
                              disabled={isSending || sendingAll}
                              onClick={async () => {
                                setSendingId(res.id);
                                try {
                                  await sendOne(res, allerT, retourT);
                                  showToast(`Convocation envoyée à ${res.legal.email}`, "success");
                                } catch (e) {
                                  showToast(`Erreur : ${e.message}`, "error");
                                } finally {
                                  setSendingId(null);
                                }
                              }}
                              style={{
                                ...btnSmallStyle,
                                background: isSending ? "#f1f5f9" : sent ? "#f0fdf4" : "#fff0f6",
                                color: isSending ? "#94a3b8" : sent ? "#16a34a" : "#B8336A",
                                border: `1.5px solid ${isSending ? "#e2e8f0" : sent ? "#86efac" : "#f3d0e6"}`,
                                cursor: isSending || sendingAll ? "not-allowed" : "pointer",
                                gap: 5,
                              }}
                            >
                              {isSending ? (
                                "Envoi…"
                              ) : sent ? (
                                <>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                  </svg>
                                  Renvoyer
                                </>
                              ) : (
                                <>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                  </svg>
                                  Envoyer
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* ── Preview modal ── */}
      {previewItem && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setPreviewItem(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0e8f5", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e1040" }}>
                  Aperçu · {previewItem.res.legal?.firstName} {previewItem.res.legal?.lastName}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{previewItem.res.legal?.email}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>

            {/* Editable subject */}
            <div style={{ padding: "10px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", whiteSpace: "nowrap" }}>Objet :</span>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 13, color: "#1e1040", outline: "none" }}
              />
            </div>

            {/* Editable times */}
            <div style={{ padding: "10px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: 16, alignItems: "center", background: "#fafafa" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" }}>Heures RDV :</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: "#16a34a", fontWeight: 700 }}>↑ Aller</span>
                <input
                  type="text"
                  value={editAllerTime}
                  onChange={(e) => setEditAllerTime(e.target.value)}
                  placeholder="ex : 08h30"
                  style={{ width: 80, padding: "4px 8px", border: "1.5px solid #d1fae5", borderRadius: 6, fontSize: 12, color: "#1e1040", outline: "none" }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: "#ea580c", fontWeight: 700 }}>↓ Retour</span>
                <input
                  type="text"
                  value={editRetourTime}
                  onChange={(e) => setEditRetourTime(e.target.value)}
                  placeholder="ex : 18h45"
                  style={{ width: 80, padding: "4px 8px", border: "1.5px solid #fed7aa", borderRadius: 6, fontSize: 12, color: "#1e1040", outline: "none" }}
                />
              </label>
              <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Modifiez pour cette convocation uniquement</span>
            </div>

            {/* Email preview */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#f5f0ff" }}>
              <div dangerouslySetInnerHTML={{ __html: buildConvocationHtml(previewItem.res, previewItem.allerT, previewItem.retourT, timeOverrides, getAnimForTransport(previewItem.allerT)) }} />
            </div>

            {/* Modal footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f0e8f5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#fff" }}>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                style={{ ...btnStyle, background: "#f1f5f9", color: "#64748b" }}
              >
                Fermer
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  style={{ ...btnStyle, background: "#f5f0ff", color: "#7c3aed", border: "1.5px solid #d4c0e8" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Télécharger PDF
                </button>
                <button
                  type="button"
                  disabled={Boolean(sendingId)}
                  onClick={handleSendFromModal}
                  style={{
                    ...btnStyle,
                    background: sendingId ? "#f1f5f9" : "#B8336A",
                    color: sendingId ? "#94a3b8" : "#fff",
                    cursor: sendingId ? "not-allowed" : "pointer",
                    boxShadow: sendingId ? "none" : "0 4px 12px rgba(184,51,106,0.3)",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  {sendingId ? "Envoi en cours…" : "Envoyer cette convocation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const btnStyle = {
  display: "inline-flex", alignItems: "center",
  padding: "8px 16px", borderRadius: 8,
  border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const btnSmallStyle = {
  display: "inline-flex", alignItems: "center",
  padding: "5px 11px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
  background: "#f5f0ff", color: "#7c3aed",
  border: "1.5px solid #d4c0e8",
};

const selectStyle = {
  padding: "7px 32px 7px 10px", border: "1.5px solid #e5e7eb",
  borderRadius: 8, fontSize: 13, color: "#374151",
  appearance: "none", cursor: "pointer", outline: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
};

const thStyle = {
  padding: "9px 14px", fontWeight: 700, fontSize: 11,
  color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em",
  textAlign: "left", borderBottom: "1px solid #e5e7eb",
};

const tdStyle = {
  padding: "11px 14px", verticalAlign: "top",
};
