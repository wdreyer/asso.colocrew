"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffAuth } from "@/src/contexts/StaffAuthContext";
import { personName } from "./format";

/** Navigation of the team space: tabs on top on desktop, a bottom bar on phones. */

const BASE = "/espace-equipe";

export const TABS = [
  { href: BASE, label: "Accueil", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: `${BASE}/planning`, label: "Planning", icon: "M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" },
  { href: `${BASE}/convoyages`, label: "Convoyages", icon: "M5 16V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10M5 16h14M5 16v3m14-3v3M8 12h.01M16 12h.01M5 9h14" },
  { href: `${BASE}/documents`, label: "Documents", icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6" },
  { href: `${BASE}/contrats`, label: "Contrats", icon: "M9 12l2 2 4-4M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" },
  { href: `${BASE}/historique`, label: "Historique", icon: "M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v5h5" },
  { href: `${BASE}/profil`, label: "Profil", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" },
];

const MOBILE_MAIN = TABS.slice(0, 4);
const MOBILE_MORE = TABS.slice(4);

function isActive(pathname, href) {
  return href === BASE ? pathname === BASE : pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ path, className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function EspaceShell({ children }) {
  const pathname = usePathname() || BASE;
  const { member, account, signOut } = useStaffAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const name = personName(member) || personName(account);
  const moreActive = MOBILE_MORE.some((tab) => isActive(pathname, tab.href));

  return (
    <div className="min-h-screen bg-[#f8f2fb] text-[#24173D]">
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-28 sm:pb-16 sm:pt-36">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="truncate text-sm text-[#6b5c7b]">Espace équipe · <strong className="text-[#24173D]">{name}</strong></p>
          <button type="button" onClick={signOut} className="hidden text-sm font-bold text-[#B8336A] sm:block">Se déconnecter</button>
        </div>

        <nav className="mb-6 hidden gap-1 overflow-x-auto rounded-2xl border border-[#ece3f3] bg-white p-1.5 sm:flex" aria-label="Espace équipe">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold transition ${isActive(pathname, tab.href) ? "bg-[#B8336A] text-white" : "text-[#5b4d6b] hover:bg-[#f8f2fb]"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-[#24173D]/30 sm:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-x-3 bottom-[84px] rounded-2xl bg-white p-2 shadow-xl" onClick={(event) => event.stopPropagation()}>
            {MOBILE_MORE.map((tab) => (
              <Link key={tab.href} href={tab.href} onClick={() => setMoreOpen(false)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-bold ${isActive(pathname, tab.href) ? "bg-[#fff0f6] text-[#B8336A]" : "text-[#24173D]"}`}>
                <Icon path={tab.icon} /> {tab.label}
              </Link>
            ))}
            <button type="button" onClick={() => { setMoreOpen(false); signOut(); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-bold text-[#b42318]">
              <Icon path="M15 17l5-5-5-5M20 12H9M12 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7" /> Se déconnecter
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#ece3f3] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Espace équipe">
        <div className="grid grid-cols-5">
          {MOBILE_MAIN.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link key={tab.href} href={tab.href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[0.68rem] font-bold ${active ? "text-[#B8336A]" : "text-[#7b6c8b]"}`}>
                <Icon path={tab.icon} className="h-6 w-6" />
                {tab.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen((open) => !open)} className={`flex flex-col items-center gap-0.5 py-2.5 text-[0.68rem] font-bold ${moreActive || moreOpen ? "text-[#B8336A]" : "text-[#7b6c8b]"}`}>
            <Icon path="M5 12h.01M12 12h.01M19 12h.01" className="h-6 w-6" />
            Plus
          </button>
        </div>
      </nav>
    </div>
  );
}
