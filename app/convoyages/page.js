"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_INFO = {
  S1: { label: "Semaine 1", dates: "6 — 17 juillet", color: "#B8336A", bg: "#fff0f6" },
  S2: { label: "Semaine 2", dates: "20 — 31 juillet", color: "#7c3aed", bg: "#f5f0ff" },
  S3: { label: "Semaine 3", dates: "3 — 14 août",    color: "#0891b2", bg: "#f0f9ff" },
  S4: { label: "Semaine 4", dates: "17 — 28 août",   color: "#16a34a", bg: "#f0fdf4" },
};

const CONSIGNES_ITEMS = [
  "Mettre son tee shirt Colocrew et son Hydroflamme si vous en avez un",
  "Être à l'heure au lieu de RDV",
  "Être souriant, répondre aux questions des parents (n'inventez rien, si vous ne savez pas, demandez nous)",
  "Faire l'appel des enfants et les cocher au fur et à mesure",
  "Demander uniquement régime alimentaire et traitement — notez les, mais ne récupérez ni ordonnance ni médicaments (l'AS s'en chargera). Vérifier pic-nic si départ avant 12h",
  "Si vous êtes 2 ou plus, répartissez-vous les tâches",
  "Dès que les parents partent vous êtes entièrement responsable des enfants (les emmener aux toilettes, faire connaissance)",
  "Attitude exemplaire et professionnelle (scrolling, messages, utilisation du téléphone, vocabulaire)",
  "Parler de Kidizz et de la communication avec les familles",
  "Commencer à appeler les familles en retard 30 min avant le départ du train",
  "Partez sur le quai au moins 20 min avant le départ du train — passé ce délai les familles en retard vous rejoignent directement sur le quai",
  "À l'entrée du train, comptez les enfants avant, pendant et après — faites-les monter en premier et restez en dernière place",
  "Sur le parcours, s'il manque des pic-nics, de l'eau ou quoi que ce soit, vous pouvez acheter et nous vous remboursons (gardez les tickets)",
];

const COMMUNICATION_ITEMS = [
  "Envoyez nous un message quand vous avez tous les enfants, que vous êtes partis, en cas de retard ou tout autre problème non urgent",
  "Si il manque un enfant, si les numéros parents ne fonctionnent pas, si il y a un problème urgent — appelez nous : 06 87 91 68 97 & 06 11 91 37 64",
];

const EMERGENCY_PHONES = [
  { label: "William", number: "0687916897", display: "06 87 91 68 97" },
  { label: "ColoCrew", number: "0611913764", display: "06 11 91 37 64" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function childFullName(c) {
  return `${c?.firstName || ""} ${c?.lastName || ""}`.trim();
}

function shortStayCode(value) {
  const normalized = normalizePlace(value);
  if (normalized.includes("eaux vives") || normalized.includes("eaux-vives")) return "EVCC";
  if (normalized.includes("surf") || normalized.includes("my creative")) return "MCSC";
  return String(value || "Séjour").trim();
}

function legalName(legal = {}) {
  return `${legal.firstName || legal.prenom || ""} ${legal.lastName || legal.nom || ""}`.trim();
}

function mapReservationPassenger(snap) {
  const data = snap.data() || {};
  const children = Array.isArray(data.minor?.children) ? data.minor.children : [];
  const first = children[0] || {};
  return {
    id: snap.id,
    numeroDeReservation: data.numeroDeReservation || "",
    nom: legalName(data.legal || {}),
    email: data.legal?.email || "",
    phone: data.legal?.phone || "",
    children,
    childName: childFullName(first),
    sejourName: data.sejour?.name || "",
    departureCity: data.transport?.departureCity || "",
    returnCity: data.transport?.returnCity || "",
    status: data.status || "",
  };
}

function hydrateTransportPassengers(transport, reservations = []) {
  const byId = new Map(reservations.map((reservation) => [reservation.id, reservation]));
  return {
    ...transport,
    passengers: (transport.passengers || []).map((passenger) => {
      const reservation = byId.get(passenger.reservationId);
      if (!reservation) return passenger;
      return {
        ...passenger,
        numeroDeReservation: reservation.numeroDeReservation,
        nom: reservation.nom,
        email: reservation.email,
        phone: reservation.phone,
        children: reservation.children,
        childName: reservation.childName,
        sejourName: reservation.sejourName,
        departureCity: reservation.departureCity,
        returnCity: reservation.returnCity,
        status: reservation.status,
        pickupCity: passenger.pickupCity || (transport.direction === "retour" ? reservation.returnCity : reservation.departureCity) || "",
      };
    }),
  };
}

function countChildren(passengers) {
  return (passengers || []).reduce((s, p) => s + Math.max(p.children?.length || 0, 1), 0);
}

function effectiveLeadStaffId(transport) {
  const assignedIds = [...new Set([
    ...(transport?.segments || []),
    ...(transport?.branches || []),
  ].flatMap((segment) => segment.assignedStaffIds || []).filter(Boolean))];
  if (assignedIds.length === 1) return assignedIds[0];
  return assignedIds.includes(transport?.leadStaffId) ? transport.leadStaffId : "";
}

function leadStaffMember(transport) {
  const leadId = effectiveLeadStaffId(transport);
  return (transport?.staff || []).find((member) => member.id === leadId) || null;
}

function normalizePlace(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Où un embranchement se raccorde au tronc commun : index du segment principal juste
// APRÈS lequel il doit apparaître (ou mainSegments.length si le raccord se fait au tout
// dernier arrêt, ex. Toulouse -> Marseille/Lyon, Paris -> Lille/Nantes en S2).
function branchJoinIndex(transport, branch) {
  const segments = transport.segments || [];
  const joinKey = normalizePlace(branch.joinsAt || (transport.direction === "retour" ? branch.from : branch.to));
  if (!joinKey) return transport.direction === "retour" ? segments.length - 1 : 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (normalizePlace(segment.from) === joinKey) return index;
    if (normalizePlace(segment.to) === joinKey) return Math.min(index + 1, segments.length);
  }
  return transport.direction === "retour" ? segments.length - 1 : segments.length;
}

function transportRouteCities(transport) {
  const cities = [];
  const append = (city) => {
    if (!city || normalizePlace(cities.at(-1)) === normalizePlace(city)) return;
    cities.push(city);
  };
  (transport?.segments || []).forEach((segment) => {
    append(segment.from);
    (segment.stops || []).forEach((stop) => append(stop.city));
    append(segment.to);
  });
  return cities;
}

function transportStageCities(transport) {
  const route = transportRouteCities(transport);
  return route.length > 2 ? route.slice(1, -1) : [];
}

function passengerBoardingCity(transport, passenger) {
  return (
    passenger.pickupCity ||
    (transport.direction === "aller" ? passenger.departureCity : passenger.returnCity) ||
    ""
  );
}

function groupPassengersByCity(transport) {
  const groups = new Map();
  (transport.passengers || []).forEach((p) => {
    const city = passengerBoardingCity(transport, p) || "Ville inconnue";
    const key = normalizePlace(city);
    if (!groups.has(key)) groups.set(key, { city, passengers: [] });
    groups.get(key).passengers.push(p);
  });
  return [...groups.values()];
}

function segmentBoardingCity(transport, segment) {
  return transport.direction === "aller" ? segment.from : segment.to;
}

function passengersAtStop(transport, segment) {
  const city = normalizePlace(segmentBoardingCity(transport, segment));
  const subCities = (segment.stops || []).map((s) => normalizePlace(s.city));
  return (transport.passengers || []).filter((p) => {
    const pCity = normalizePlace(passengerBoardingCity(transport, p));
    return pCity === city || subCities.includes(pCity);
  });
}

function passengersDroppingAt(transport, city) {
  const target = normalizePlace(city);
  return (transport.passengers || []).filter((passenger) =>
    normalizePlace(passenger.dropoffCity) === target,
  );
}

function ticketSegmentLabel(ticket, segments) {
  const seg = (segments || []).find((s) => s.id === ticket.segmentId);
  return seg ? `${seg.from || "?"} → ${seg.to || "?"}` : (ticket.segmentLabel || "");
}

function firstNameOf(fullName) {
  return (fullName || "").split(" ")[0] || fullName || "vous";
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function BackBtn({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", padding: "4px 0",
        fontSize: 14, color: "#7c3aed", fontWeight: 700, cursor: "pointer",
        marginBottom: 24, display: "flex", alignItems: "center", gap: 4,
      }}
    >
      ← {label}
    </button>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
      <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: 11, minWidth: 96, textTransform: "uppercase", letterSpacing: "0.05em", paddingTop: 2 }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#1e1040", fontSize: 13, flex: 1 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children, color = "#B8336A" }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
      color, margin: "24px 0 12px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{ height: 2, width: 28, background: `${color}40`, flexShrink: 0 }} />
      {children}
      <div style={{ height: 2, flex: 1, background: `${color}20` }} />
    </div>
  );
}

function Collapse({ title, icon, defaultOpen = false, printAlwaysOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 14, borderRadius: 14, overflow: "hidden", border: "1.5px solid #e5e7eb" }}>
      <style>{printAlwaysOpen ? `.print-collapse-content { display: block !important; }` : ""}</style>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 18px", background: "#f9fafb", border: "none", cursor: "pointer", gap: 10,
        }}
        className="no-print"
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "#374151", display: "flex", gap: 8, alignItems: "center" }}>
          {icon && <span>{icon}</span>}
          {title}
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{open ? "▲" : "▼"}</span>
      </button>
      <div style={{ display: open ? "block" : "none", padding: "14px 16px" }} className="print-collapse-content">
        {children}
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function StepWeek({ onSelect }) {
  return (
    <div style={wrap}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={logo}>ColoCrew</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, fontWeight: 500 }}>Espace convoyage — Été 2026</div>
      </div>
      <h2 style={stepTitle}>Quelle est votre semaine ?</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(WEEK_INFO).map(([key, info]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 20px", background: info.bg,
              border: `2px solid ${info.color}35`,
              borderRadius: 14, cursor: "pointer", textAlign: "left",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: info.color }}>{key} — {info.label}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{info.dates} 2026</div>
            </div>
            <span style={{ fontSize: 18, color: info.color }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepTransport({ week, transports, weekInfo, onBack, onSelect }) {
  if (!transports.length) {
    return (
      <div style={wrap}>
        <BackBtn onClick={onBack} label={`${week} — ${weekInfo?.dates}`} />
        <h2 style={stepTitle}>Aucun trajet disponible</h2>
        <p style={{ fontSize: 14, color: "#94a3b8" }}>
          Aucun transport n&apos;est encore configuré pour {week}. Contacte l&apos;équipe ColoCrew.
        </p>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <BackBtn onClick={onBack} label={`${week} — ${weekInfo?.dates}`} />
      <h2 style={stepTitle}>Choisissez votre trajet</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...transports]
          .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.direction || "").localeCompare(b.direction || ""))
          .map((t) => {
            const isAller = t.direction !== "retour";
            const dirColor = isAller ? "#16a34a" : "#ea580c";
            const staffCount = (t.staff || []).length;
            const childCount = countChildren(t.passengers || []);
            const stageCities = transportStageCities(t);
            const branches = t.branches || [];
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "15px 18px", background: "#fff",
                  border: "2px solid #e5e7eb", borderRadius: 14, cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ fontSize: 26, color: dirColor, flexShrink: 0, lineHeight: 1 }}>{isAller ? "↑" : "↓"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1e1040" }}>
                    {t.departureCity || "?"} → {t.arrivalCity || "?"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {fmtDate(t.date)}
                    {t.meetingTime ? ` · RDV ${t.meetingTime}` : ""}
                  </div>
                  {stageCities.length > 0 && (
                    <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 5, fontWeight: 700 }}>
                      Étapes : {stageCities.join(" → ")}
                    </div>
                  )}
                  {branches.map((branch) => (
                    <div key={branch.id || `${branch.from}-${branch.to}`} style={{ fontSize: 11, color: "#B8336A", marginTop: 3, fontWeight: 700 }}>
                      Embranchement : {branch.from || "?"} → {branch.to || "?"}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    {staffCount > 0 && (
                      <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>
                        {staffCount} anim.
                      </span>
                    )}
                    {childCount > 0 && (
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        {childCount} enfant{childCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: "#94a3b8" }}>→</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

function StepStaff({ transport, weekInfo, onBack, onSelect }) {
  const staff = transport?.staff || [];
  const isAller = transport?.direction !== "retour";
  const leadId = effectiveLeadStaffId(transport);
  return (
    <div style={wrap}>
      <BackBtn onClick={onBack} label={`${transport?.departureCity} → ${transport?.arrivalCity}`} />
      <h2 style={stepTitle}>Qui êtes-vous ?</h2>
      <p style={{ fontSize: 13, color: "#64748b", margin: "-16px 0 20px" }}>
        {isAller ? "Aller" : "Retour"} · {fmtDate(transport?.date)}
      </p>
      <button
        onClick={() => onSelect("__all__")}
        style={{ width: "100%", marginBottom: 14, padding: "13px 16px", border: "2px solid #B8336A", borderRadius: 12, background: "#fff0f6", color: "#B8336A", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
      >
        Voir le trajet complet et toutes les listes
      </button>
      {staff.length === 0 ? (
        <div style={{ padding: "24px 20px", background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 14, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🙋</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>Aucun animateur affecté</div>
          <div style={{ fontSize: 13, color: "#78350f", marginTop: 4 }}>
            Aucun animateur n&apos;est encore assigné à ce trajet.<br />
            Contacte l&apos;équipe ColoCrew.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {EMERGENCY_PHONES.map((p) => (
              <a key={p.number} href={`tel:${p.number}`} style={{ ...callBtn, background: "#B8336A" }}>
                📞 {p.display}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staff.map((member) => (
            <button
              key={member.id}
              onClick={() => onSelect(member.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 18px", background: "#fff",
                border: "2px solid #e5e7eb", borderRadius: 12, cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "#f3eef8", color: "#7c3aed",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 800, flexShrink: 0,
                letterSpacing: "-0.02em",
              }}>
                {(member.name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e1040" }}>
                  {member.name || "Animateur"}{member.id === leadId ? " · Chef de convoi" : ""}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{member.role || "Animateur convoyeur"}</div>
              </div>
              <span style={{ fontSize: 16, color: "#94a3b8" }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Briefing view ────────────────────────────────────────────────────────────

function BriefingView({ transport, staff, mySegments, myTickets, weekInfo, onBack }) {
  const isAller = transport.direction !== "retour";
  const dirColor = isAller ? "#16a34a" : "#ea580c";
  const totalChildren = countChildren(transport.passengers || []);
  const passengerGroups = groupPassengersByCity(transport);
  const firstName = firstNameOf(staff?.name);
  const leadMember = leadStaffMember(transport);
  const stageCities = transportStageCities(transport);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 60 }}>
      {/* Global print styles */}
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          main { padding-top: 0 !important; }
          .print-show { display: block !important; }
          .print-page-break { page-break-before: always; }
          .print-collapse-content { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Sticky top bar */}
      <div
        className="no-print"
        style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "#B8336A", color: "#fff",
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 12px rgba(184,51,106,0.35)",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>ColoCrew · Convoyage</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            {isAller ? "↑" : "↓"} {transport.departureCity} → {transport.arrivalCity} · {weekInfo?.label}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onBack}
            style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ← Changer
          </button>
          <button
            onClick={() => window.print()}
            style={{ background: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", color: "#B8336A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            PDF 🖨️
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* ── Welcome card ── */}
        <div style={{
          marginBottom: 18, padding: "20px 22px",
          background: "linear-gradient(135deg, #fff0f6 0%, #f5f0ff 100%)",
          borderRadius: 18, border: "1.5px solid #f3d0e6",
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#B8336A", marginBottom: 8 }}>
            Bonjour {firstName} ! 👋
          </div>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            Merci de ton implication chez Colocrew. Le convoyage est un moment stressant et important du séjour — c&apos;est souvent notre seul contact avec les parents et responsables.{" "}
            <strong>Il faut être exemplaire et rassurant.</strong>
          </div>
        </div>

        {/* ── Transport summary card ── */}
        <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 16, overflow: "hidden", marginBottom: 18 }}>
          <div style={{
            padding: "13px 18px",
            background: isAller ? "#f0fdf4" : "#fff7ed",
            borderBottom: "1px solid #e5e7eb",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 28, color: dirColor, lineHeight: 1 }}>{isAller ? "↑" : "↓"}</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, color: "#1e1040" }}>
                {transport.departureCity || "?"} → {transport.arrivalCity || "?"}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                {isAller ? "Aller" : "Retour"} · {weekInfo?.label} ({weekInfo?.dates} 2026)
              </div>
              {stageCities.length > 0 && (
                <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 4, fontWeight: 700 }}>
                  Étapes : {stageCities.join(" → ")}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {[
              ["Date", fmtDate(transport.date)],
              ["Train", `${transport.trainType || ""} ${transport.trainNumber || ""}`.trim() || null],
              ["Point de RDV", transport.meetingPoint || transport.departureCity || null],
              ["Heure de RDV", transport.meetingTime || null],
              ["Voie / quai", transport.platform || null],
              ["Départ train", transport.departureTime || null],
              ["Arrivée", transport.arrivalTime || null],
              ["Passagers", `${totalChildren} enfant${totalChildren > 1 ? "s" : ""}`],
              ["Chef de convoi", leadMember?.name || "À désigner"],
            ]
              .filter(([, v]) => v)
              .map(([label, value], i, arr) => (
                <div
                  key={i}
                  style={{
                    padding: "11px 16px",
                    borderBottom: i < arr.length - 2 ? "1px solid #f0f0f0" : "none",
                    borderRight: i % 2 === 0 ? "1px solid #f0f0f0" : "none",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e1040" }}>{value}</div>
                </div>
              ))}
          </div>
        </div>

        {/* ── My segments ── */}
        <SectionTitle color="#7c3aed">
          Mes arrêts {mySegments.length > 0 ? `(${mySegments.length})` : ""}
        </SectionTitle>

        {mySegments.length === 0 ? (
          <div style={{ padding: "18px 20px", background: "#f5f0ff", border: "1.5px solid #d4c0e8", borderRadius: 12, marginBottom: 18, fontSize: 14, color: "#7c3aed" }}>
            Aucun arrêt ne t&apos;est encore affecté sur ce trajet. Contacte l&apos;équipe pour confirmation.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {mySegments.map((seg, i) => {
              const stopPassengers = passengersAtStop(transport, seg);
              const childCount = Number(seg.sharedChildrenCount || 0) || countChildren(stopPassengers);
              const finalDropoffs = passengersDroppingAt(transport, seg.to);
              return (
                <div key={seg.id || i} style={{ background: "#fff", border: "1.5px solid #ddd5f5", borderRadius: 14, overflow: "hidden" }}>
                  {/* Segment header */}
                  <div style={{
                    padding: "11px 16px", background: "#7c3aed",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>
                      {seg._type === "branch" ? "Embranchement" : `Arrêt ${i + 1}`} — {seg.from || "?"} → {seg.to || "?"}
                    </div>
                    <div style={{
                      background: "rgba(255,255,255,0.2)", borderRadius: 100,
                      padding: "2px 10px", fontSize: 12, color: "#fff", fontWeight: 700,
                    }}>
                      {childCount} enfant{childCount > 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Segment details */}
                  <div style={{ padding: "14px 16px" }}>
                    <InfoRow label="Point de RDV" value={seg.meetingPoint || "À définir"} />
                    <InfoRow label="Heure de RDV" value={seg.meetingTime} />
                    <InfoRow label="Voie / quai" value={seg.platform} />
                    <InfoRow label="Départ" value={seg.departureTime} />
                    <InfoRow label="Arrivée" value={seg.arrivalTime} />
                    <InfoRow label="Train" value={`${seg.mode || ""} ${seg.number || ""}`.trim() || null} />

                    {seg.instructions && (
                      <div style={{
                        marginTop: 10, padding: "10px 14px",
                        background: "#fff7ed", border: "1px solid #fed7aa",
                        borderRadius: 8, fontSize: 13, color: "#92400e", lineHeight: 1.6,
                      }}>
                        📋 {seg.instructions}
                      </div>
                    )}
                    {Number(seg.capacityShortage || 0) > 0 && (
                      <div style={{ marginTop: 10, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#b91c1c", fontWeight: 800 }}>
                        Capacité insuffisante : {seg.sharedCapacity} places pour {seg.sharedChildrenCount} enfants, soit {seg.capacityShortage} places manquantes avant les animateurs.
                      </div>
                    )}

                    {/* Sub-stops */}
                    {(seg.stops || []).length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 8 }}>
                          Villes étapes
                        </div>
                        {seg.stops.map((stop, si) => {
                          const dropoffs = passengersDroppingAt(transport, stop.city);
                          return (
                          <div key={si} style={{ padding: "8px 12px", background: "#f9f7ff", border: "1px solid #e9e0f8", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                            <div style={{ fontWeight: 700, color: "#1e1040" }}>{stop.city || "Ville inconnue"}</div>
                            {(stop.arrivalTime || stop.departureTime) && (
                              <div style={{ color: "#7c3aed", marginTop: 2, fontSize: 12 }}>
                                {stop.arrivalTime && `Arr. ${stop.arrivalTime}`}
                                {stop.departureTime && ` · Dép. ${stop.departureTime}`}
                              </div>
                            )}
                            {stop.meetingPoint && <div style={{ color: "#64748b", marginTop: 2, fontSize: 12 }}>RDV : {stop.meetingPoint}</div>}
                            {dropoffs.length > 0 && (
                              <div style={{ marginTop: 6, color: "#b45309", fontWeight: 800, fontSize: 12 }}>
                                ↓ {countChildren(dropoffs)} enfant{countChildren(dropoffs) > 1 ? "s" : ""} descendent ici · {shortStayCode(dropoffs[0]?.sejourName || dropoffs[0]?.stayCode)}
                              </div>
                            )}
                          </div>
                          );
                        })}
                        {finalDropoffs.length > 0 && (
                          <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                            <div style={{ fontWeight: 700, color: "#166534" }}>{seg.to}</div>
                            <div style={{ marginTop: 3, color: "#166534", fontWeight: 800, fontSize: 12 }}>
                              ↓ {countChildren(finalDropoffs)} enfant{countChildren(finalDropoffs) > 1 ? "s" : ""} descendent ici · {shortStayCode(finalDropoffs[0]?.sejourName || finalDropoffs[0]?.stayCode)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Children at this stop */}
                    {stopPassengers.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7c3aed", marginBottom: 8 }}>
                          Enfants à prendre en charge
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {stopPassengers.map((p, pi) => {
                            const children = p.children?.length
                              ? p.children
                              : [{ firstName: p.childName, lastName: "" }];
                            return (
                              <div key={pi} style={{
                                padding: "10px 12px", background: "#fff",
                                border: "1.5px solid #e9e0f8", borderRadius: 10,
                              }}>
                                <div style={{ fontWeight: 800, fontSize: 14, color: "#1e1040" }}>
                                  {children.map((c) => childFullName(c)).filter(Boolean).join(", ") || p.childName || "—"}
                                </div>
                                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: "#B8336A" }}>
                                  Séjour : {p.stayCode || shortStayCode(p.sejourName)}{p.dropoffCity ? ` · Descente ${p.dropoffCity}` : ""}
                                </div>
                                <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
                                  <strong>{p.nom}</strong>
                                </div>
                                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                                  <a
                                    href={`tel:${(p.phone || "").replace(/\s/g, "")}`}
                                    style={{ fontSize: 13, color: "#7c3aed", fontWeight: 600, textDecoration: "none" }}
                                  >
                                    📞 {p.phone || "—"}
                                  </a>
                                  {p.numeroDeReservation && (
                                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                                      {p.numeroDeReservation}
                                    </span>
                                  )}
                                </div>
                                {/* Children birth dates */}
                                {children.some((c) => c.birthDate) && (
                                  <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                                    {children.filter((c) => c.birthDate).map((c, ci) => (
                                      <span key={ci}>
                                        {childFullName(c)} — né·e le{" "}
                                        {new Date(c.birthDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                                      </span>
                                    )).reduce((acc, el, ci) => ci === 0 ? [el] : [...acc, " · ", el], [])}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {stopPassengers.length === 0 && (
                      <div style={{ marginTop: 10, fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                        Aucun enfant affecté à cet arrêt.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tickets ── */}
        {myTickets.length > 0 && (
          <>
            <SectionTitle color="#0891b2">Billets de transport ({myTickets.length})</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {myTickets.map((ticket, i) => (
                <div key={ticket.id || i} style={{
                  padding: "14px 16px", background: "#f0f9ff",
                  border: "1.5px solid #bae6fd", borderRadius: 12,
                }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#0c4a6e" }}>{ticket.name || "Billet"}</div>
                  <div style={{ fontSize: 12, color: "#0369a1", marginTop: 3 }}>
                    {ticketSegmentLabel(ticket, transport.segments || [])}
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                    {ticket.departureTime && (
                      <span style={{ fontSize: 13, color: "#0c4a6e", fontWeight: 600 }}>🕐 Dép. {ticket.departureTime}</span>
                    )}
                    {ticket.arrivalTime && (
                      <span style={{ fontSize: 13, color: "#0c4a6e", fontWeight: 600 }}>🏁 Arr. {ticket.arrivalTime}</span>
                    )}
                    {ticket.seats > 0 && (
                      <span style={{ fontSize: 13, color: "#0c4a6e" }}>💺 {ticket.seats} place{ticket.seats > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {ticket.bookingReference && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", fontFamily: "monospace", background: "#e0f2fe", display: "inline-block", padding: "2px 8px", borderRadius: 4 }}>
                      Réf : {ticket.bookingReference}
                    </div>
                  )}
                  {ticket.url && (
                    <a
                      href={ticket.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        marginTop: 12, padding: "9px 18px",
                        background: "#0891b2", color: "#fff",
                        borderRadius: 8, textDecoration: "none",
                        fontSize: 13, fontWeight: 700,
                      }}
                    >
                      📄 Ouvrir le PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Consignes (collapsible) ── */}
        <SectionTitle color="#92400e">Consignes</SectionTitle>
        <Collapse title="Consignes convoyage ColoCrew" icon="📋" defaultOpen={false}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Consignes :</p>
          <ul style={{ paddingLeft: 18, margin: "0 0 18px", display: "flex", flexDirection: "column", gap: 7 }}>
            {CONSIGNES_ITEMS.map((item, i) => (
              <li key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>{item}</li>
            ))}
          </ul>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Communication :</p>
          <ul style={{ paddingLeft: 18, margin: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            {COMMUNICATION_ITEMS.map((item, i) => (
              <li key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>{item}</li>
            ))}
          </ul>
        </Collapse>

        {/* ── All passengers (collapsible) ── */}
        <SectionTitle color="#374151">
          Tous les passagers ({totalChildren} enfant{totalChildren > 1 ? "s" : ""})
        </SectionTitle>
        <Collapse title={`Liste complète — ${totalChildren} enfant${totalChildren > 1 ? "s" : ""}`} icon="👥" defaultOpen={false}>
          {passengerGroups.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>Aucun passager configuré.</p>
          ) : (
            passengerGroups.map((group, gi) => {
              const groupCount = countChildren(group.passengers);
              return (
                <div key={gi} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em",
                    color: "#B8336A", marginBottom: 8, paddingBottom: 5,
                    borderBottom: "2px solid #f3eef8",
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span>{group.city}</span>
                    <span>{groupCount} enfant{groupCount > 1 ? "s" : ""}</span>
                  </div>
                  {group.passengers.map((p, pi) => {
                    const children = p.children?.length
                      ? p.children
                      : [{ firstName: p.childName, lastName: "" }];
                    return (
                      <div key={pi} style={{
                        padding: "9px 0", borderBottom: pi < group.passengers.length - 1 ? "1px solid #f5f3ff" : "none",
                        display: "flex", gap: 10, alignItems: "flex-start",
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: "#f3eef8", color: "#7c3aed",
                          fontSize: 11, fontWeight: 800,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, marginTop: 2,
                        }}>
                          {pi + 1}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e1040" }}>
                            {children.map((c) => childFullName(c)).filter(Boolean).join(", ") || p.childName || "—"}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: "#B8336A" }}>
                            Séjour : {p.stayCode || shortStayCode(p.sejourName)}{p.dropoffCity ? ` · Descente ${p.dropoffCity}` : ""}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                            {p.nom} ·{" "}
                            <a href={`tel:${(p.phone || "").replace(/\s/g, "")}`} style={{ color: "#7c3aed", textDecoration: "none", fontWeight: 600 }}>
                              {p.phone || "—"}
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </Collapse>

        {/* ── Emergency contacts ── */}
        <SectionTitle color="#b91c1c">Urgences</SectionTitle>
        <div style={{
          padding: "16px 18px", background: "#fef2f2",
          border: "1.5px solid #fecaca", borderRadius: 14, marginBottom: 20,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#b91c1c", marginBottom: 12 }}>
            🚨 Contacts d&apos;urgence ColoCrew
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {EMERGENCY_PHONES.map((p) => (
              <a
                key={p.number}
                href={`tel:${p.number}`}
                style={callBtn}
              >
                📞 {p.display}
              </a>
            ))}
          </div>
          {(transport.emergencyContact || transport.emergencyPhone) && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(185,28,28,0.08)", borderRadius: 8, fontSize: 13, color: "#991b1b" }}>
              <strong>{transport.emergencyContact || "Urgence"}</strong>
              {transport.emergencyPhone && ` · ${transport.emergencyPhone}`}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        {transport.notes && (
          <>
            <SectionTitle color="#64748b">Notes du trajet</SectionTitle>
            <div style={{
              padding: "14px 16px", background: "#fff7ed",
              border: "1.5px solid #fed7aa", borderRadius: 12, marginBottom: 20,
              fontSize: 13, color: "#78350f", lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {transport.notes}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrap = {
  maxWidth: 460,
  margin: "0 auto",
  padding: "28px 16px 60px",
};

const logo = {
  fontSize: 30,
  fontWeight: 900,
  color: "#B8336A",
  letterSpacing: "-0.02em",
};

const stepTitle = {
  margin: "0 0 22px",
  fontSize: 22,
  fontWeight: 900,
  color: "#1e1040",
  letterSpacing: "-0.01em",
};

const callBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "11px 20px",
  background: "#b91c1c",
  color: "#fff",
  borderRadius: 100,
  textDecoration: "none",
  fontSize: 15,
  fontWeight: 700,
  boxShadow: "0 4px 12px rgba(185,28,28,0.3)",
};

// ─── Page export ──────────────────────────────────────────────────────────────

export default function ConvoyagePage() {
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);

  const [week, setWeek] = useState(null);
  const [transportId, setTransportId] = useState(null);
  const [staffId, setStaffId] = useState(null);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, COLLECTIONS.TRANSPORTS), orderBy("date", "asc"))),
      getDocs(collection(db, COLLECTIONS.RESERVATIONS)),
    ])
      .then(([transportSnap, reservationSnap]) => {
        const reservations = reservationSnap.docs.map(mapReservationPassenger);
        setTransports(transportSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .map((transport) => hydrateTransportPassengers(transport, reservations)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const weekTransports = useMemo(
    () => transports.filter((t) => t.week === week && normalizePlace(t.status || "") !== "annule"),
    [transports, week],
  );

  const selectedTransport = useMemo(
    () => transports.find((t) => t.id === transportId) || null,
    [transports, transportId],
  );

  const selectedStaff = useMemo(
    () => staffId === "__all__"
      ? { id: "__all__", name: "Équipe", role: "Vue complète" }
      : (selectedTransport?.staff || []).find((m) => m.id === staffId) || null,
    [selectedTransport, staffId],
  );

  const mySegments = useMemo(() => {
    if (!selectedTransport || !selectedStaff) return [];
    const mainSegments = (selectedTransport.segments || []).map((seg, idx) => ({ ...seg, _index: idx, _type: "segment" }));
    const branches = (selectedTransport.branches || []).map((seg, idx) => ({ ...seg, _index: idx, _type: "branch" }));

    // Chaque embranchement est inséré juste après le point du tronc commun où il se
    // raccorde (fourche), ou en fin de liste s'il part du tout dernier arrêt.
    const ordered = [];
    mainSegments.forEach((segment, i) => {
      branches
        .filter((branch) => branchJoinIndex(selectedTransport, branch) === i)
        .forEach((branch) => ordered.push(branch));
      ordered.push(segment);
    });
    branches
      .filter((branch) => branchJoinIndex(selectedTransport, branch) >= mainSegments.length)
      .forEach((branch) => ordered.push(branch));

    return ordered
      .filter((seg) => selectedStaff.id === "__all__" || (seg.assignedStaffIds || []).includes(selectedStaff.id));
  }, [selectedTransport, selectedStaff]);

  const myTickets = useMemo(() => {
    if (!selectedTransport || !mySegments.length) return [];
    const ids = new Set(mySegments.map((s) => s.id).filter(Boolean));
    return (selectedTransport.tickets || []).filter((t) => t.purchased && t.segmentId && ids.has(t.segmentId));
  }, [selectedTransport, mySegments]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 16px", color: "#94a3b8", fontSize: 15 }}>
        Chargement en cours…
      </div>
    );
  }

  if (!week) return <StepWeek onSelect={setWeek} />;

  if (!transportId) {
    return (
      <StepTransport
        week={week}
        transports={weekTransports}
        weekInfo={WEEK_INFO[week]}
        onBack={() => setWeek(null)}
        onSelect={setTransportId}
      />
    );
  }

  if (!staffId) {
    return (
      <StepStaff
        transport={selectedTransport}
        weekInfo={WEEK_INFO[week]}
        onBack={() => setTransportId(null)}
        onSelect={setStaffId}
      />
    );
  }

  return (
    <BriefingView
      transport={selectedTransport}
      staff={selectedStaff}
      mySegments={mySegments}
      myTickets={myTickets}
      weekInfo={WEEK_INFO[week]}
      onBack={() => setStaffId(null)}
    />
  );
}
