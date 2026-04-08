"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  FaBars,
  FaChevronDown,
  FaComments,
  FaEnvelope,
  FaPhone,
  FaTimes,
  FaArrowRight,
} from "react-icons/fa";

/* ─── DATA ─────────────────────────────────── */

const sejoursItems = [
  {
    href: "/sejours/my-creative-surf-camp",
    label: "My Creative Surf Camp",
    sub: "Pays Basque · 11-17 ans · Juil.–Août 2026",
    image: "/mcsc2026.jpg",
    badge: "Séjour phare",
    badgeColor: "#B8336A",
  },
  {
    href: "/sejours/eaux-vives-creative-camp",
    label: "Eaux Vives Creative Camp",
    sub: "Montagne · 11-17 ans · Juil.–Août 2026",
    image: "/ovive.png",
    badge: "Nouveauté 2026",
    badgeColor: "#7c3aed",
  },
];

const infosItems = [
  { href: "/aide-financement#tarifs", label: "Tarifs 2026" },
  { href: "/aide-financement#aides", label: "Aides et financements" },
];

const aproposItems = [
  { href: "/qui-sommes-nous", label: "L'association" },
  { href: "/anims", label: "Équipe et recrutement" },
];

/* ─── CSS INJECTÉ ────────────────────────────── */
const injectCss = `
  /* ── Hover effets ── */
  .hdr-sejour-card:hover { background: #fdf6f9 !important; }
  .hdr-sejour-card:hover .hdr-card-img { transform: scale(1.06) !important; }
  .hdr-sejour-card:hover .hdr-card-title { color: #B8336A !important; }
  .hdr-sejour-card:hover .hdr-card-cta { letter-spacing: 0.06em !important; gap: 8px !important; }
  .hdr-simple-item:hover { background: #fdf3f7 !important; color: #B8336A !important; }
  .hdr-simple-item:hover .hdr-arrow { color: #B8336A !important; transform: translateX(4px) !important; }
  .hdr-nav-btn:hover { color: #B8336A !important; }
  .hdr-nav-btn:hover .hdr-nav-chevron { color: #B8336A !important; }
  .hdr-blog-link:hover { color: #B8336A !important; }

  /* ── Barre principale (hauteur + padding responsive) ── */
  .hdr-main-bar {
    height: 80px;
    position: relative;
    max-width: 1280px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 24px;
  }
  @media (max-width: 1023px) { .hdr-main-bar { height: 72px; padding: 0 16px; } }
  @media (max-width: 719px)  { .hdr-main-bar { height: 64px; padding: 0 12px; } }

  /* ── Logo ── */
  .hdr-logo-img { height: 54px; width: auto; }
  .hdr-logo-name {
    margin: 0; font-family: "Baloo 2", cursive; font-weight: 800;
    color: #2a2050; line-height: 1; font-size: 36px;
  }
  .hdr-logo-sub {
    margin: 4px 0 0; font-weight: 700; color: #B8336A;
    letter-spacing: 0.25em; font-size: 13px;
  }
  @media (max-width: 1023px) {
    .hdr-logo-img  { height: 46px; }
    .hdr-logo-name { font-size: 30px; }
    .hdr-logo-sub  { font-size: 11px; letter-spacing: 0.18em; margin-top: 2px; }
  }
  @media (max-width: 719px) {
    .hdr-logo-img  { height: 38px; }
    .hdr-logo-name { font-size: 26px; }
    .hdr-logo-sub  { font-size: 10px; letter-spacing: 0.12em; }
  }

  /* ── Boutons de nav (réduction padding puis police) ── */
  .hdr-nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    background: none;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.18s;
    padding: 9px 12px;
  }
  .hdr-blog-link {
    display: inline-flex;
    align-items: center;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #24173d;
    text-decoration: none;
    white-space: nowrap;
    transition: color 0.18s;
    padding: 9px 12px;
  }
  /* Étape 1 : réduire le padding */
  @media (max-width: 1279px) {
    .hdr-nav-btn   { padding: 8px 9px; }
    .hdr-blog-link { padding: 8px 9px; }
  }
  @media (max-width: 1023px) {
    .hdr-nav-btn   { padding: 7px 6px; }
    .hdr-blog-link { padding: 7px 6px; }
  }
  @media (max-width: 860px) {
    .hdr-nav-btn   { padding: 6px 5px; }
    .hdr-blog-link { padding: 6px 5px; }
  }
  @media (max-width: 750px) {
    .hdr-nav-btn   { padding: 5px 4px; }
    .hdr-blog-link { padding: 5px 4px; }
  }
  /* Étape 2 : réduire la police */
  @media (max-width: 1023px) {
    .hdr-nav-btn   { font-size: 0.9rem; letter-spacing: 0.03em; }
    .hdr-blog-link { font-size: 0.9rem; letter-spacing: 0.03em; }
  }
  @media (max-width: 860px) {
    .hdr-nav-btn   { font-size: 0.82rem; letter-spacing: 0.02em; }
    .hdr-blog-link { font-size: 0.82rem; letter-spacing: 0.02em; }
  }
  @media (max-width: 750px) {
    .hdr-nav-btn   { font-size: 0.76rem; letter-spacing: 0; }
    .hdr-blog-link { font-size: 0.76rem; letter-spacing: 0; }
  }

  /* ── Padding interne de la nav (côté droit : 0 pour que les CTAs soient collés au bord) ── */
  .hdr-nav-inner { padding-left: 24px; padding-right: 0; }
  @media (max-width: 1023px) { .hdr-nav-inner { padding-left: 12px; } }
  @media (max-width: 860px)  { .hdr-nav-inner { padding-left: 6px;  } }
  @media (max-width: 750px)  { .hdr-nav-inner { padding-left: 2px;  } }

  /* ── MES RÉSERVATIONS ── */
  .hdr-top-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.88rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    color: #2b2250;
    text-decoration: none;
    text-transform: uppercase;
    white-space: nowrap;
    transition: color 0.18s ease, transform 0.18s ease;
  }
  .hdr-top-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #B8336A;
    opacity: 0.68;
    flex-shrink: 0;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }
  .hdr-top-link:hover { color: #B8336A !important; transform: translateY(-1px); }
  .hdr-top-link:hover .hdr-top-dot { opacity: 1; transform: scale(1.2); }
  @media (max-width: 1279px) { .hdr-top-link { font-size: 0.82rem; letter-spacing: 0.05em; gap: 6px; } }
  @media (max-width: 1023px) { .hdr-top-link { font-size: 0.76rem; letter-spacing: 0.03em; gap: 5px; } }
  /* Masqué seulement sur les petits écrans (après réduction max) */
  @media (max-width: 859px)  { .hdr-top-link { display: none; } }

  /* ── Pill RÉSERVER ── */
  .hdr-resa-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
    font-weight: 700;
    color: #B8336A;
    background: #fce8f0;
    border: 2px solid #B8336A;
    border-radius: 999px;
    padding: 8px 16px;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.2s, color 0.2s;
  }
  .hdr-resa-pill:hover { background: #B8336A !important; color: #fff !important; }
  @media (max-width: 1279px) { .hdr-resa-pill { padding: 7px 13px; font-size: 0.825rem; } }
  @media (max-width: 1023px) { .hdr-resa-pill { padding: 6px 10px; font-size: 0.78rem; gap: 4px; } }
  @media (max-width: 860px)  { .hdr-resa-pill { padding: 5px 9px;  font-size: 0.73rem; gap: 3px; } }
  @media (max-width: 750px)  { .hdr-resa-pill { padding: 4px 8px;  font-size: 0.68rem; } }

  /* ── Zone CTAs — enfant direct de hdr-main-bar, toujours collée à droite ── */
  .hdr-ctas {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  @media (max-width: 1279px) { .hdr-ctas { gap: 8px; } }
  @media (max-width: 1023px) { .hdr-ctas { gap: 6px; } }
  @media (max-width: 860px)  { .hdr-ctas { gap: 4px; } }

  /* ── Téléphone (toujours visible, taille réduite) ── */
  .hdr-phone-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid #eadfce;
    background: #fff;
    padding: 8px 12px;
    font-size: 0.875rem;
    font-weight: 600;
    color: #24173d;
    text-decoration: none;
    white-space: nowrap;
    transition: border-color 0.2s, color 0.2s;
  }
  .hdr-phone-link:hover { border-color: #B8336A !important; color: #B8336A !important; }
  @media (max-width: 1279px) { .hdr-phone-link { padding: 7px 10px; font-size: 0.82rem; } }
  @media (max-width: 1023px) { .hdr-phone-link { padding: 6px 8px;  font-size: 0.78rem; gap: 6px; } }
  @media (max-width: 860px)  { .hdr-phone-link { padding: 5px 7px;  font-size: 0.73rem; gap: 5px; } }
  @media (max-width: 750px)  { .hdr-phone-link { padding: 4px 6px;  font-size: 0.68rem; gap: 4px; } }

  .hdr-resa-cta-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 1.15rem;
    font-weight: 700;
    color: #B8336A;
    text-decoration: none;
    border-bottom: 2px solid transparent;
    padding-bottom: 2px;
    transition: border-color 0.22s, gap 0.22s, color 0.18s;
  }
  .hdr-resa-cta-link:hover {
    border-color: #B8336A !important;
    gap: 14px !important;
    color: #982a57 !important;
  }
`;

/* ─── SÉJOURS DROPDOWN ─────────────────────── */

function SejoursDropdown({ open }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: "100%",
        paddingTop: 10,
        width: 560,
        zIndex: 60,
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        transform: open ? "translateY(0)" : "translateY(8px)",
      }}
    >
      <div style={{
        background: "#fff",
        border: "1px solid #e9ddd0",
        borderRadius: 14,
        boxShadow: "0 20px 60px rgba(33,21,55,0.18)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "12px 20px 8px", borderBottom: "1px solid #f3eee8" }}>
          <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.14em", color: "#9e91b0", textTransform: "uppercase" }}>
            Nos séjours été 2026
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {sejoursItems.map((s, i) => (
            <Link
              key={s.href}
              href={s.href}
              className="hdr-sejour-card"
              style={{
                display: "block",
                textDecoration: "none",
                borderRight: i === 0 ? "1px solid #f3eee8" : "none",
                transition: "background 0.18s",
              }}
            >
              <div style={{ position: "relative", height: 148, overflow: "hidden" }}>
                <Image
                  src={s.image}
                  alt={s.label}
                  fill
                  className="hdr-card-img"
                  style={{ objectFit: "cover", transition: "transform 0.55s ease" }}
                  sizes="280px"
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)" }} />
                <span style={{
                  position: "absolute", top: 10, left: 10,
                  background: s.badgeColor, color: "#fff",
                  fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em",
                  padding: "3px 10px", borderRadius: 100, textTransform: "uppercase",
                }}>{s.badge}</span>
              </div>

              <div style={{ padding: "14px 18px 16px" }}>
                <p className="hdr-card-title" style={{
                  margin: "0 0 4px",
                  fontFamily: '"Baloo 2", cursive',
                  fontWeight: 800, fontSize: "1rem",
                  color: "#1f1640", lineHeight: 1.25,
                  transition: "color 0.18s",
                }}>{s.label}</p>
                <p style={{ margin: "0 0 10px", fontSize: "0.76rem", color: "#7d748f", fontWeight: 500 }}>{s.sub}</p>
                <span className="hdr-card-cta" style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: "0.8rem", fontWeight: 700, color: "#B8336A",
                  transition: "gap 0.2s, letter-spacing 0.2s",
                }}>
                  Voir le séjour <FaArrowRight size={10} />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ padding: "11px 20px", borderTop: "1px solid #f3eee8", background: "#fdf8fb" }}>
          <Link href="/sejours" style={{ fontSize: "0.82rem", fontWeight: 700, color: "#B8336A", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
            className="hover:opacity-75 transition-opacity">
            Voir tous les séjours <FaArrowRight size={10} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── DROPDOWN SIMPLE ──────────────────────── */

function SimpleDropdown({ items, open, width = 240 }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: "100%",
        paddingTop: 10,
        width,
        zIndex: 60,
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        transform: open ? "translateY(0)" : "translateY(8px)",
      }}
    >
      <div style={{
        background: "#fff",
        border: "1px solid #e9ddd0",
        borderRadius: 10,
        boxShadow: "0 16px 48px rgba(33,21,55,0.16)",
        overflow: "hidden",
        padding: "6px 0",
      }}>
        {items.map((item) => (
          <Link
            key={item.href + item.label}
            href={item.href}
            className="hdr-simple-item"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "11px 18px",
              fontSize: "0.92rem", fontWeight: 600,
              color: "#2d2445", textDecoration: "none",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {item.label}
            <FaArrowRight
              size={9}
              className="hdr-arrow"
              style={{ color: "#e0c8d8", flexShrink: 0, transition: "color 0.15s, transform 0.15s" }}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── NAV ITEM avec dropdown ───────────────── */

function NavItem({ label, openKey, itemKey, setOpenKey, children }) {
  const isOpen = openKey === itemKey;

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setOpenKey(itemKey)}
      onMouseLeave={() => setOpenKey("")}
    >
      <button
        type="button"
        className="hdr-nav-btn"
        onClick={() => setOpenKey(isOpen ? "" : itemKey)}
        style={{
          color: isOpen ? "#B8336A" : "#24173d",
          transition: "color 0.18s",
        }}
      >
        {label}
        <FaChevronDown
          className="hdr-nav-chevron"
          size={11}
          style={{
            transition: "transform 0.22s ease, color 0.18s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            color: isOpen ? "#B8336A" : "#b0a8c0",
          }}
        />
      </button>
      {children}
    </div>
  );
}

/* ─── MOBILE MENU ──────────────────────────── */

function MobileMenu({ isOpen, closeMenu }) {
  const [openSection, setOpenSection] = useState("sejours");
  if (!isOpen) return null;

  const sections = [
    { key: "sejours", label: "SÉJOURS", items: sejoursItems.map((s) => ({ href: s.href, label: s.label })) },
    { key: "infos", label: "INFOS PRATIQUES", items: infosItems },
    { key: "apropos", label: "COLOCREW", items: aproposItems },
  ];

  return (
    <div style={{ borderTop: "1px solid #eadfce", background: "#fff", padding: 16 }} className="md:hidden">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sections.map((s) => {
          const active = openSection === s.key;
          return (
            <div key={s.key} style={{ border: "1px solid #eadfce", borderRadius: 8, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setOpenSection(active ? "" : s.key)}
                style={{
                  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                  padding: "13px 16px", fontSize: "0.9rem", fontWeight: 700, letterSpacing: "0.06em",
                  color: active ? "#B8336A" : "#24173d",
                  background: active ? "#fdf8fb" : "#fff",
                  border: "none", cursor: "pointer", transition: "background 0.15s, color 0.15s",
                }}
              >
                {s.label}
                <FaChevronDown size={11} style={{
                  transition: "transform 0.2s",
                  transform: active ? "rotate(180deg)" : "rotate(0)",
                  color: active ? "#B8336A" : "#b0a8c0",
                }} />
              </button>
              {active && (
                <div style={{ borderTop: "1px solid #f3eee8", background: "#fdf8fb", padding: "6px 0" }}>
                  {s.items.map((item) => (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      onClick={closeMenu}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", fontSize: "0.9rem", fontWeight: 600, color: "#362d4f", textDecoration: "none", transition: "color 0.15s" }}
                      className="hover:text-[#B8336A]"
                    >
                      <FaArrowRight size={9} style={{ color: "#d4b8ce", flexShrink: 0 }} />
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <Link href="/#journal" onClick={closeMenu}
          style={{ display: "block", border: "1px solid #eadfce", borderRadius: 8, padding: "13px 16px", fontSize: "0.9rem", fontWeight: 700, letterSpacing: "0.06em", color: "#24173d", textDecoration: "none" }}
          className="hover:text-[#B8336A]">
          BLOG
        </Link>

        <Link
          href="/sejours"
          onClick={closeMenu}
          className="flex items-center justify-center gap-1.5 text-[#B8336A] bg-[#fce8f0] border-2 border-[#B8336A] font-bold text-sm px-4 py-3 rounded-full hover:bg-[#B8336A] hover:text-white transition-colors duration-200"
          style={{ textDecoration: "none" }}
        >
          RÉSERVER <span className="font-black">↗</span>
        </Link>
      </div>
    </div>
  );
}

/* ─── CONTACT WIDGET ───────────────────────── */

function ContactWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-5 z-[65]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ background: "#B8336A", borderRadius: "50%", padding: 16, color: "#fff", boxShadow: "0 10px 28px rgba(184,51,106,0.38)", border: "none", cursor: "pointer", transition: "transform 0.18s, background 0.18s" }}
          className="hover:-translate-y-1 hover:bg-[#982a57]"
          aria-label="Contact rapide"
        >
          <FaComments size={20} />
        </button>
      ) : (
        <div style={{ width: 300, border: "1px solid #eadfce", background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 20px 48px rgba(25,17,44,0.22)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#21153c", padding: "12px 16px", color: "#fff" }}>
            <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em" }}>CONTACT RAPIDE</p>
            <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><FaTimes /></button>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <a href="tel:0184210230" style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #eadfce", borderRadius: 8, padding: "10px 14px", fontSize: "0.875rem", fontWeight: 600, color: "#24173d", textDecoration: "none", transition: "border-color 0.15s" }} className="hover:border-[#B8336A]">
              <FaPhone style={{ color: "#B8336A" }} /> 01 84 21 02 30
            </a>
            <a href="mailto:info@colocrew.com" style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #eadfce", borderRadius: 8, padding: "10px 14px", fontSize: "0.875rem", fontWeight: 600, color: "#24173d", textDecoration: "none", transition: "border-color 0.15s" }} className="hover:border-[#B8336A]">
              <FaEnvelope style={{ color: "#B8336A" }} /> info@colocrew.com
            </a>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#645c79" }}>On vous répond rapidement, en général sous 24h.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── HEADER ───────────────────────────────── */

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openKey, setOpenKey] = useState("");

  return (
    <>
      <style>{injectCss}</style>

      <header style={{ position: "fixed", inset: "0 0 auto 0", zIndex: 50, borderBottom: "1px solid #e9ddd0", background: "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)" }}>

        {/* Bandeau */}
        <div style={{ background: "#B8336A" }}>
          <div className="mx-auto flex max-w-[1240px] items-center justify-center px-4 py-1 sm:h-8 sm:py-0">
            <div className="flex flex-col items-center gap-0.5 text-white sm:flex-row sm:gap-2" style={{ margin: 0, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.14em", lineHeight: 1.2 }}>
              <span>SAISON ÉTÉ 2026 • RÉSERVATIONS OUVERTES</span>
              <span className="hidden opacity-70 sm:inline">|</span>
              <a href="#" className="underline underline-offset-2 transition-opacity hover:opacity-80">
                LE CATALOGUE 2026 EST SORTI
              </a>
            </div>
          </div>
        </div>

        {/* Barre principale */}
        <div className="hdr-main-bar">

          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Image src="/LogoColoCrew.png" alt="Logo ColoCrew" width={74} height={74}
              className="hdr-logo-img" priority />
            <div className="hidden sm:block" style={{ lineHeight: 1 }}>
              <p className="hdr-logo-name">ColoCrew</p>
              <p className="hdr-logo-sub">SAISON 2026</p>
            </div>
          </Link>

          {/* Nav desktop — items seulement, visible à partir de md (768px) */}
          <nav className="hidden md:flex flex-1 items-center hdr-nav-inner" style={{ gap: 0, flexWrap: "nowrap" }}>

            <NavItem label="SÉJOURS" itemKey="sejours" openKey={openKey} setOpenKey={setOpenKey}>
              <SejoursDropdown open={openKey === "sejours"} />
            </NavItem>

            <NavItem label="INFOS PRATIQUES" itemKey="infos" openKey={openKey} setOpenKey={setOpenKey}>
              <SimpleDropdown items={infosItems} open={openKey === "infos"} width={260} />
            </NavItem>

            <NavItem label="COLOCREW" itemKey="apropos" openKey={openKey} setOpenKey={setOpenKey}>
              <SimpleDropdown items={aproposItems} open={openKey === "apropos"} width={220} />
            </NavItem>

            <Link href="/#journal" className="hdr-blog-link">
              BLOG
            </Link>
          </nav>

          {/* CTAs — enfant direct de la barre → toujours collés au bord droit */}
          <div className="hidden md:flex hdr-ctas">

            {/* Téléphone */}
            <a href="tel:0184210230" className="hdr-phone-link">
              <FaPhone size={12} />
              01 84 21 02 30
            </a>

            {/* Réserver — pill rose */}
            <Link href="/sejours" className="hdr-resa-pill">
              RÉSERVER <span style={{ fontWeight: 900 }}>↗</span>
            </Link>

            {/* MES RÉSERVATIONS — dernier = collé au bord droit */}
            <Link href="/reservation" className="hdr-top-link">
              <span className="hdr-top-dot" />
              MES RÉSERVATIONS
            </Link>
          </div>

          {/* Burger — uniquement en dessous de md */}
          <button
            type="button"
            onClick={() => setMobileOpen((p) => !p)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#24173d", padding: 4 }}
            className="md:hidden"
          >
            {mobileOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
          </button>
        </div>

        <MobileMenu isOpen={mobileOpen} closeMenu={() => setMobileOpen(false)} />
      </header>

      <ContactWidget />
    </>
  );
}
