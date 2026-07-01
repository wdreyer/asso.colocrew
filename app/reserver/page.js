"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase";
import Image from "next/image";
import Link from "next/link";
import { FaArrowRight, FaFilePdf } from "react-icons/fa";

import RecapReservation from "../components/reserver/RecapReservation";
import ReservationFormFields from "../components/reserver/ReservationForm";
import PaymentOptions from "../components/reserver/PaymentOptions";
import Spinner from "../components/layout/Spinner";
import {
  calculateReservationPriceRange,
  extractPriceRange,
  formatPriceRange,
  normalizeChildCount,
  resolveSejourPriceRange,
  siblingDiscountFactor,
} from "@/src/lib/pricing";

const CATALOG_PDF_PATH = "/Catalogue%20Colocrew%20-%20ETE2026.pdf";

/* ─── Séjours disponibles (données statiques pour le sélecteur) ─── */
const SEJOURS_META = [
  {
    slug: "my-creative-surf-camp",
    name: "My Creative Surf Camp",
    sub: "Vieux Boucau · Surf & Projet Artistique",
    image: "/mcsc2026.jpg",
    badge: "Août : dernières places",
    badgeColor: "#d88700",
  },
  {
    slug: "eaux-vives-creative-camp",
    name: "Eaux Vives Creative Camp",
    sub: "Pays Basque · Eaux vives & Projet Artistique",
    image: "/ovive.png",
    badge: "Offre juillet",
    badgeColor: "#B8336A",
  },
];

const CSS_LANDING = `
  .landing-card {
    position: relative;
    border: 2.5px solid #e9ddd0;
    border-radius: 16px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    background: #fff;
    flex: 1;
    min-width: 220px;
  }
  .landing-card:hover {
    border-color: #B8336A;
    box-shadow: 0 8px 28px rgba(184,51,106,0.14);
    transform: translateY(-3px);
  }
  .landing-card.is-active {
    border-color: #B8336A;
    box-shadow: 0 0 0 3px rgba(184,51,106,0.18);
  }
  .landing-card .card-img-wrap {
    position: relative;
    height: 160px;
    overflow: hidden;
  }
  .landing-card img { transition: transform 0.45s ease; }
  .landing-card:hover img, .landing-card.is-active img { transform: scale(1.06); }

  .landing-select {
    width: 100%;
    appearance: none;
    background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23B8336A' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 14px center;
    border: 2px solid #e9ddd0;
    border-radius: 10px;
    padding: 12px 40px 12px 14px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #24173d;
    cursor: pointer;
    transition: border-color 0.2s;
    outline: none;
  }
  .landing-select:focus, .landing-select:hover { border-color: #B8336A; }
  .landing-select:disabled { opacity: 0.45; cursor: not-allowed; }

  .landing-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #B8336A;
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0.03em;
    padding: 14px 32px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    transition: background 0.2s, transform 0.18s;
    text-decoration: none;
  }
  .landing-btn:hover:not(:disabled) { background: #982a57; transform: translateY(-2px); }
  .landing-btn:disabled { opacity: 0.45; cursor: not-allowed; }
`;

/* ─── Helpers ─── */
function formatDateFR(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateOptionPrice(dateEntry) {
  const range = extractPriceRange(dateEntry);
  if (!(range.min > 0 || range.max > 0)) return "";
  return ` - Offre ${formatPriceRange(range)}`;
}

function isSessionFull(dateEntry) {
  return dateEntry?.bookingOpen === false || dateEntry?.availabilityStatus === "full";
}

function isSessionLimited(dateEntry) {
  return dateEntry?.bookingOpen !== false && dateEntry?.availabilityStatus === "limited";
}

function CatalogNotice({ compact = false }) {
  return (
    <a
      href={CATALOG_PDF_PATH}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full rounded-2xl border border-[#f0d3e4] transition"
      style={{
        background: compact ? "#fff7fc" : "rgba(255,255,255,0.14)",
        color: compact ? "#6b2950" : "#fff",
        padding: compact ? "12px 16px" : "12px 14px",
      }}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              background: compact ? "#fff" : "rgba(255,255,255,0.2)",
              color: "#B8336A",
            }}
          >
            <FaFilePdf size={14} />
          </span>
          <span style={{ lineHeight: 1.25 }}>
            <strong style={{ fontSize: "0.8rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Catalogue été 2026
            </strong>
            <span style={{ display: "block", fontSize: "0.78rem", opacity: compact ? 0.78 : 0.9 }}>
              Télécharger le PDF complet
            </span>
          </span>
        </span>
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em]">
          Ouvrir
          <FaArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </a>
  );
}

/* ─────────────────────────────────────────────────
   PAGE LANDING : choix du séjour, dates, tranche d'âge
───────────────────────────────────────────────── */
function LandingSelector() {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [sejour, setSejour]             = useState(null);
  const [loadingSejour, setLoadingSejour] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [selectedAge, setSelectedAge]         = useState("");
  const [departureCity, setDepartureCity]     = useState("");
  const [returnCity, setReturnCity]           = useState("");
  const [diffReturn, setDiffReturn]           = useState(false);

  /* Charge le séjour Firestore quand on sélectionne une card */
  useEffect(() => {
    if (!selectedSlug) return;
    setLoadingSejour(true);
    setSejour(null);
    setSelectedDateKey("");
    setSelectedAge("");
    setDepartureCity("");
    setReturnCity("");
    setDiffReturn(false);
    getDoc(doc(db, "sejours", selectedSlug)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSejour(data);
        if (data?.promotion?.active && data.promotion.startDate) {
          const promoStart = String(data.promotion.startDate).slice(0, 10);
          const promoEntry = (data.dates || []).find(
            (d) => String(d.startDate || "").slice(0, 10) === promoStart
          );
          if (promoEntry && !isSessionFull(promoEntry)) {
            setSelectedDateKey(`${promoEntry.startDate}|${promoEntry.endDate}`);
          }
        }
      }
      setLoadingSejour(false);
    });
  }, [selectedSlug]);

  /* Calcul prix transport pour affichage */
  const stations = sejour?.stations || [];
  const depStation = stations.find((s) => s.name === departureCity);
  const retStation = stations.find((s) => s.name === returnCity);
  const transportFee = !departureCity ? 0
    : !diffReturn || departureCity === returnCity
      ? (depStation?.priceExtra ?? 0)
      : (depStation?.priceExtra ?? 0) / 2 + (retStation?.priceExtra ?? 0) / 2;

  const effectiveReturnCity = diffReturn ? returnCity : departureCity;
  const selectedDateEntry = (sejour?.dates || []).find(
    (dateEntry) => `${dateEntry.startDate}|${dateEntry.endDate}` === selectedDateKey,
  );
  const canContinue = selectedSlug && selectedDateKey && selectedAge && !isSessionFull(selectedDateEntry);

  const handleContinue = () => {
    if (!canContinue) return;
    const [startDate, endDate] = selectedDateKey.split("|");
    const params = new URLSearchParams({ sejour: selectedSlug, startDate, endDate, ageGroup: selectedAge });
    if (departureCity)         params.set("departureCity", departureCity);
    if (effectiveReturnCity)   params.set("returnCity", effectiveReturnCity);
    router.push(`/reserver?${params}`);
  };

  return (
    <>
      <style>{CSS_LANDING}</style>

      <div style={{ minHeight: "100vh", background: "#fdf8fb" }}>

        {/* Hero / titre */}
        <div style={{ background: "linear-gradient(135deg, #1f1640 0%, #3b1f5e 100%)", padding: "56px 24px 48px", textAlign: "center" }}>
          <p style={{ margin: "0 0 12px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.22em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>
            Été 2026 · Réservations ouvertes
          </p>
          <h1 style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 800, fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#fff", margin: "0 0 12px", lineHeight: 1.15 }}>
            Choisissez votre séjour
          </h1>
          <p style={{ margin: 0, fontSize: "1rem", color: "rgba(255,255,255,0.68)", fontWeight: 500 }}>
            Sélectionnez un séjour, des dates et une tranche d'âge pour obtenir votre estimation de tarif.
          </p>
        </div>

        {/* Contenu */}
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "40px 20px 64px" }}>

          {/* Étape 1 : choix du séjour */}
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 700, fontSize: "1.05rem", color: "#1f1640", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#B8336A", color: "#fff", fontSize: "0.8rem", fontWeight: 800, flexShrink: 0 }}>1</span>
              Quel séjour vous intéresse ?
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {SEJOURS_META.map((s) => (
                <div
                  key={s.slug}
                  className={`landing-card${selectedSlug === s.slug ? " is-active" : ""}`}
                  onClick={() => setSelectedSlug(s.slug)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedSlug(s.slug)}
                >
                  <div className="card-img-wrap">
                    <Image src={s.image} alt={s.name} fill style={{ objectFit: "cover" }} sizes="360px" />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />
                    <span style={{
                      position: "absolute", top: 10, left: 10,
                      background: s.badgeColor, color: "#fff",
                      fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em",
                      padding: "3px 10px", borderRadius: 100, textTransform: "uppercase",
                    }}>{s.badge}</span>
                    {selectedSlug === s.slug && (
                      <span style={{
                        position: "absolute", top: 10, right: 10,
                        width: 26, height: 26, borderRadius: "50%",
                        background: "#B8336A", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 7l3.5 3.5L11 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <div style={{ padding: "14px 16px 16px" }}>
                    <p style={{ margin: "0 0 4px", fontFamily: '"Baloo 2", cursive', fontWeight: 800, fontSize: "1rem", color: "#1f1640" }}>{s.name}</p>
                    <p style={{ margin: 0, fontSize: "0.78rem", color: "#7d748f", fontWeight: 500 }}>{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Étape 2 : dates + âge — apparaît quand un séjour est choisi */}
          {selectedSlug && (
            <div style={{ display: "grid", gap: 24, marginBottom: 40 }}>
              {loadingSejour ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>
              ) : sejour ? (
                <>
                  {/* Dates */}
                  <div>
                    <p style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 700, fontSize: "1.05rem", color: "#1f1640", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#B8336A", color: "#fff", fontSize: "0.8rem", fontWeight: 800, flexShrink: 0 }}>2</span>
                      Quelle session vous intéresse ?
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(sejour.dates || []).map((d, i) => {
                        const key = `${d.startDate}|${d.endDate}`;
                        const isSelected = selectedDateKey === key;
                        const isFull = isSessionFull(d);
                        const isLimited = isSessionLimited(d);
                        const promoStart = String(sejour?.promotion?.startDate || "").slice(0, 10);
                        const isPromo = Boolean(!isFull && sejour?.promotion?.active && promoStart && String(d.startDate || "").slice(0, 10) === promoStart);
                        const promoRange = isPromo ? extractPriceRange(d) : null;
                        const promoPrice = promoRange?.min > 0 ? `dès ${formatPriceRange({ min: promoRange.min, max: promoRange.min })}` : "";
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={isFull}
                            onClick={() => !isFull && setSelectedDateKey(key)}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "14px 18px",
                              borderRadius: 14,
                              border: isFull ? "2px solid #d7d1dc" : isSelected ? "2px solid #B8336A" : isLimited ? "2px solid #e7a526" : isPromo ? "2px solid #f5c0d5" : "2px solid #e9ddd0",
                              background: isFull ? "#f4f2f5" : isSelected ? "#fff3f8" : isLimited ? "#fffaf0" : isPromo ? "#fffafc" : "#fff",
                              cursor: isFull ? "not-allowed" : "pointer",
                              opacity: isFull ? 0.72 : 1,
                              textAlign: "left",
                              transition: "border-color 0.18s, box-shadow 0.18s",
                              boxShadow: isSelected ? "0 0 0 3px rgba(184,51,106,0.15)" : "none",
                              outline: "none",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              {isFull && (
                                <span style={{ display: "inline-block", marginBottom: 7, background: "#514a59", color: "#fff", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", padding: "3px 10px", borderRadius: 100, textTransform: "uppercase" }}>
                                  Complet
                                </span>
                              )}
                              {isLimited && (
                                <span style={{ display: "inline-block", marginBottom: 7, background: "#d88700", color: "#fff", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 100, textTransform: "uppercase" }}>
                                  Quelques places restantes - dépêchez-vous !
                                </span>
                              )}
                              {isPromo && (
                                <span style={{
                                  display: "inline-block",
                                  marginBottom: 7,
                                  background: "#B8336A",
                                  color: "#fff",
                                  fontSize: "0.62rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.1em",
                                  padding: "3px 10px",
                                  borderRadius: 100,
                                  textTransform: "uppercase",
                                }}>✦ Offre juillet</span>
                              )}
                              <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "#1f1640", lineHeight: 1.3 }}>
                                {formatDateFR(d.startDate)} → {formatDateFR(d.endDate)}
                              </p>
                              {d.label ? (
                                <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#7d748f", fontWeight: 500 }}>{d.label}</p>
                              ) : null}
                              {isPromo && promoPrice ? (
                                <p style={{ margin: "5px 0 0", fontSize: "0.82rem", fontWeight: 800, color: "#B8336A" }}>
                                  {promoPrice}
                                </p>
                              ) : null}
                            </div>
                            <span style={{
                              flexShrink: 0,
                              marginTop: 3,
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: isSelected ? "#B8336A" : "transparent",
                              border: isSelected ? "none" : "2px solid #dfd3e8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              {isSelected && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tranche d'âge */}
                  <div>
                    <p style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 700, fontSize: "1.05rem", color: "#1f1640", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#B8336A", color: "#fff", fontSize: "0.8rem", fontWeight: 800, flexShrink: 0 }}>3</span>
                      Tranche d'âge de votre enfant
                    </p>
                    <select
                      className="landing-select"
                      value={selectedAge}
                      onChange={(e) => setSelectedAge(e.target.value)}
                    >
                      <option value="">— Choisissez une tranche d'âge —</option>
                      {(sejour.ageGroups || []).map((age, i) => (
                        <option key={i} value={age}>{age}</option>
                      ))}
                    </select>
                  </div>

                  {/* Transport */}
                  {stations.length > 0 && (
                    <div>
                      <p style={{ fontFamily: '"Baloo 2", cursive', fontWeight: 700, fontSize: "1.05rem", color: "#1f1640", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#B8336A", color: "#fff", fontSize: "0.8rem", fontWeight: 800, flexShrink: 0 }}>4</span>
                        Transport (optionnel)
                      </p>

                      {/* Ville de départ */}
                      <select
                        className="landing-select"
                        value={departureCity}
                        onChange={(e) => {
                          setDepartureCity(e.target.value);
                          if (!diffReturn) setReturnCity(e.target.value);
                        }}
                      >
                        
                        {stations.map((st, i) => (
                          <option key={i} value={st.name}>
                            {st.name}{st.priceExtra ? ` (+${st.priceExtra} €)` : ""}
                          </option>
                        ))}
                      </select>

                      {/* Checkbox A/R différents */}
                      {departureCity && (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", fontSize: "0.88rem", fontWeight: 600, color: "#3d2f5e" }}>
                          <input
                            type="checkbox"
                            checked={diffReturn}
                            onChange={(e) => {
                              setDiffReturn(e.target.checked);
                              if (!e.target.checked) setReturnCity(departureCity);
                              else setReturnCity("");
                            }}
                            style={{ accentColor: "#B8336A", width: 16, height: 16 }}
                          />
                          Aller et retour depuis des villes différentes
                        </label>
                      )}

                      {/* Ville de retour (si A/R différents) */}
                      {departureCity && diffReturn && (
                        <select
                          className="landing-select"
                          style={{ marginTop: 10 }}
                          value={returnCity}
                          onChange={(e) => setReturnCity(e.target.value)}
                        >
                          <option value="">— Ville de retour —</option>
                          {stations.map((st, i) => (
                            <option key={i} value={st.name}>
                              {st.name}{st.priceExtra ? ` (+${(st.priceExtra / 2).toFixed(0)} €)` : ""}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Affichage du coût transport */}
                      {departureCity && (
                        <p style={{ marginTop: 10, fontSize: "0.82rem", color: transportFee > 0 ? "#B8336A" : "#7d748f", fontWeight: 600 }}>
                          {transportFee > 0
                            ? `Transport estimé : +${transportFee % 1 === 0 ? transportFee : transportFee.toFixed(2)} €`
                            : "Transport inclus"}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: "#B8336A", fontSize: "0.9rem" }}>Séjour introuvable, contactez-nous.</p>
              )}
            </div>
          )}

          {/* CTA */}
          <div style={{ textAlign: "center" }}>
            <button
              className="landing-btn"
              onClick={handleContinue}
              disabled={!canContinue}
            >
              Obtenir mon estimation
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <p style={{ marginTop: 12, fontSize: "0.8rem", color: "#9e91b0" }}>
              Sans engagement · Tarif définitif communiqué sous 24h
            </p>
          </div>

          {/* Lien retour séjours */}
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <Link href="/sejours" style={{ fontSize: "0.85rem", color: "#B8336A", fontWeight: 600, textDecoration: "none", opacity: 0.8 }}>
              ← Voir la présentation des séjours
            </Link>
          </div>

          <div style={{ marginTop: 24 }}>
            <CatalogNotice compact />
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────
   GESTIONNAIRE de changements imbriqués
───────────────────────────────────────────────── */
function handleNestedChange(e, setFormData) {
  const { name, value, type, checked } = e.target;
  if (name.includes(".")) {
    const keys = name.split(".");
    setFormData((prev) => {
      let newObj = { ...prev };
      let temp = newObj;
      for (let i = 0; i < keys.length - 1; i++) {
        temp[keys[i]] = { ...temp[keys[i]] };
        temp = temp[keys[i]];
      }
      temp[keys[keys.length - 1]] = type === "checkbox" ? checked : value;
      return newObj;
    });
  } else {
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }
}

/* ─── Modal de traitement ─── */
function ProcessingModal({ image, sejourName }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}
      >
        {/* Miniature du séjour */}
        {image && (
          <div className="relative w-full" style={{ height: 140 }}>
            <Image src={image} alt={sejourName || "Séjour"} fill className="object-cover" priority />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.55))" }} />
            {sejourName && (
              <p className="absolute bottom-3 left-4 text-white text-xs font-bold tracking-widest uppercase" style={{ letterSpacing: "0.14em" }}>
                {sejourName}
              </p>
            )}
          </div>
        )}

        {/* Contenu */}
        <div className="flex flex-col items-center text-center px-8 py-8 gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "#fce8f0" }}
          >
            <Spinner />
          </div>
          <div>
            <h2 className="text-lg font-extrabold mb-1" style={{ color: "#1e1040", fontFamily: '"Baloo 2", cursive' }}>
              Estimation en cours…
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#6b5f82" }}>
              Nous enregistrons votre demande.<br />
              Vous serez redirigé automatiquement.
            </p>
          </div>

          {/* Barre de progression */}
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "#f0e8f5" }}>
            <div
              className="h-full rounded-full"
              style={{ background: "#B8336A", animation: "progress-slide 1.8s ease-in-out infinite" }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes progress-slide {
          0%   { transform: translateX(-100%); width: 45%; }
          100% { transform: translateX(240%);  width: 45%; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   PAGE FORMULAIRE (paramètres présents dans l'URL)
───────────────────────────────────────────────── */
function ReservationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [estimatedPriceString, setEstimatedPriceString] = useState("");

  const urlSejour        = searchParams.get("sejour")        || "";
  const urlStartDate     = searchParams.get("startDate")     || "";
  const urlEndDate       = searchParams.get("endDate")       || "";
  const urlAgeGroup      = searchParams.get("ageGroup")      || "";
  const urlDepartureCity = searchParams.get("departureCity") || "";
  const urlReturnCity    = searchParams.get("returnCity")    || "";

  /* ── Cas sans paramètres : affiche la page de sélection ── */
  if (!urlSejour) {
    return <LandingSelector />;
  }

  return <ReservationForm
    router={router}
    urlSejour={urlSejour}
    urlStartDate={urlStartDate}
    urlEndDate={urlEndDate}
    urlAgeGroup={urlAgeGroup}
    urlDepartureCity={urlDepartureCity}
    urlReturnCity={urlReturnCity}
    estimatedPriceString={estimatedPriceString}
    setEstimatedPriceString={setEstimatedPriceString}
  />;
}

/* ─────────────────────────────────────────────────
   FORMULAIRE COMPLET (extrait pour clarté)
───────────────────────────────────────────────── */
function ReservationForm({
  router,
  urlSejour, urlStartDate, urlEndDate, urlAgeGroup,
  urlDepartureCity, urlReturnCity,
  estimatedPriceString, setEstimatedPriceString,
}) {
  const [sejour,      setSejour]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialFormData = {
    minor: {
      children: [{
        firstName: "", lastName: "", birthDate: "",
        birthPlace: "", address: "", city: "", postalCode: "",
      }],
    },
    numberOfChildren: "",
    legal: {
      firstName: "", lastName: "", phone: "", email: "",
      relation: "", addressDifferent: false,
      address: "", city: "", postalCode: "",
      promoCode: "", cafOrSecu: "", qf: "",
      justificatif: null, message: "",
    },
    insuranceOpted: false,
    paymentMethod: "CB",
    acceptedCGV: false,
    acceptedRGPD: false,
  };

  const [formData, setFormData] = useState(initialFormData);
  const handleChange = (e) => handleNestedChange(e, setFormData);

  /* Charge le séjour depuis Firestore */
  useEffect(() => {
    async function fetchSejour() {
      const slug = urlSejour.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-");
      const snap = await getDoc(doc(db, "sejours", slug));
      if (snap.exists()) setSejour(snap.data());
      else alert("Séjour non trouvé.");
      setLoading(false);
    }
    fetchSejour();
  }, [urlSejour]);

  const insuranceFee = 58.86;
  const selectedPriceRange = resolveSejourPriceRange(sejour, urlStartDate);

  let effectiveTransportFee = 0;
  if (sejour?.stations) {
    if (urlDepartureCity === urlReturnCity) {
      const st = sejour.stations.find((s) => s.name === urlDepartureCity);
      effectiveTransportFee = st ? st.priceExtra : 0;
    } else {
      const dep = sejour.stations.find((s) => s.name === urlDepartureCity);
      const ret = sejour.stations.find((s) => s.name === urlReturnCity);
      effectiveTransportFee = (dep ? dep.priceExtra : 0) / 2 + (ret ? ret.priceExtra : 0) / 2;
    }
  }

  const nbChildren = normalizeChildCount(formData.numberOfChildren);
  const discountFactor = siblingDiscountFactor(nbChildren);

  const computedRange = calculateReservationPriceRange(selectedPriceRange, {
    childCount: nbChildren,
    discountFactor,
    transportFee: effectiveTransportFee,
    insuranceFee: formData.insuranceOpted ? insuranceFee : 0,
    flatDiscount:
      String(formData?.legal?.promoCode || "").trim().toUpperCase() === "NOEL" ? 50 : 0,
  });

  const computedTotalPriceMin = computedRange.min;
  const computedTotalPriceMax = computedRange.max;
  const computedTotalPrice = computedTotalPriceMax;
  const selectedSession = (sejour?.dates || []).find(
    (dateEntry) => String(dateEntry.startDate || "").slice(0, 10) === String(urlStartDate || "").slice(0, 10),
  );

  const validateForm = () => {
    const errors = [];
    if (formData.minor.children.some((c) => !c.firstName || !c.lastName || !c.birthDate || !c.address || !c.city || !c.postalCode))
      errors.push("Veuillez remplir tous les champs obligatoires pour chaque enfant.");
    if (!formData.legal.firstName || !formData.legal.lastName || !formData.legal.phone || !formData.legal.email || !formData.legal.relation)
      errors.push("Veuillez remplir tous les champs obligatoires du responsable légal.");
    if (formData.legal.relation === "autre" && !formData.legal.relationOther)
      errors.push("Veuillez préciser la relation (autre).");
    if (formData.legal.addressDifferent && (!formData.legal.address || !formData.legal.city || !formData.legal.postalCode))
      errors.push("Veuillez remplir l'adresse complète du responsable légal.");
    if (!formData.acceptedCGV)  errors.push("Vous devez accepter les CGV.");
    if (!formData.acceptedRGPD) errors.push("Vous devez accepter la politique de confidentialité (RGPD).");
    if (errors.length > 0) { alert(errors.join("\n")); return false; }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      if (formData.legal.justificatif)
        fd.append("file", formData.legal.justificatif, formData.legal.justificatif.name);
      const fields = {
        ...formData,
        estimatedPriceString, computedTotalPrice,
        computedTotalPriceMin, computedTotalPriceMax,
        basePriceMin: selectedPriceRange.min,
        basePriceMax: selectedPriceRange.max,
        childCount: nbChildren,
        discountFactor,
        flatDiscount: String(formData?.legal?.promoCode || "").trim().toUpperCase() === "NOEL" ? 50 : 0,
        urlSejour, urlStartDate, urlEndDate, urlAgeGroup,
        departureCity: urlDepartureCity, returnCity: urlReturnCity,
        insuranceFee, transportFee: effectiveTransportFee,
      };
      fields.legal.justificatif = undefined;
      fd.append("fields", JSON.stringify(fields));

      const res = await fetch("/api/reservation", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Erreur lors de l'enregistrement.");
      const { tokenUnique } = await res.json();
      router.push(`/reservation/${tokenUnique}?justCreated=true`);
      // Ne pas appeler setIsSubmitting(false) ici — la modale reste affichée jusqu'à navigation complète
      return;
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue, veuillez réessayer.");
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><Spinner /></div>;
  if (!sejour)  return <div className="p-4">Aucun séjour à afficher.</div>;
  if (isSessionFull(selectedSession)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdf8fb] px-4">
        <div className="w-full max-w-lg bg-white border border-[#e4dce8] rounded-lg p-8 text-center shadow-sm">
          <span className="inline-flex rounded-full bg-[#514a59] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white">
            Complet
          </span>
          <h1 className="mt-5 text-2xl font-extrabold text-[#1f1640]">Cette session de juillet est complète</h1>
          <p className="mt-3 text-[#6b5f82]">Les inscriptions restent ouvertes en août, avec seulement quelques places disponibles.</p>
          <Link href="/reserver" className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#B8336A] px-5 py-3 font-bold text-white">
            Voir les sessions d'août <FaArrowRight size={13} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:p-6 relative">
      {isSubmitting && (
        <ProcessingModal
          image={SEJOURS_META.find((s) => s.slug === urlSejour)?.image || sejour?.heroImage || ""}
          sejourName={sejour?.name || sejour?.nom || SEJOURS_META.find((s) => s.slug === urlSejour)?.name || ""}
        />
      )}


      <div className="bg-white rounded p-4">
        <RecapReservation
          sejour={sejour}
          urlStartDate={urlStartDate}
          urlEndDate={urlEndDate}
          urlAgeGroup={urlAgeGroup}
          departureCity={urlDepartureCity}
          returnCity={urlReturnCity}
        />
      </div>

      <div className="bg-white rounded p-4 my-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <ReservationFormFields formData={formData} handleChange={handleChange} />

          <PaymentOptions
            formData={formData}
            handleChange={handleChange}
            transportFee={effectiveTransportFee}
            sejour={sejour}
            insuranceFee={insuranceFee}
            selectedStartDate={urlStartDate}
            numberOfChildren={nbChildren}
            onEstimatedPriceChange={setEstimatedPriceString}
          />
          <div className="mt-6 text-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full font-poppins cursor-pointer md:w-auto bg-[#B8336A] text-white px-6 py-2 rounded-md hover:bg-[#A2225A] transition duration-300 text-sm md:text-base"
            >
              {isSubmitting ? "Envoi en cours..." : "Obtenir mon estimation de tarif"}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}

/* ─── Export ─── */
export default function ReservationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner /></div>}>
      <ReservationPageContent />
    </Suspense>
  );
}
