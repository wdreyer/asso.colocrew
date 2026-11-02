"use client";

import StaffGate from "@/src/components/espace/StaffGate";
import EspaceShell from "@/src/components/espace/EspaceShell";
import { StaffDataProvider } from "@/src/components/espace/StaffDataContext";

/** Pages reserved to approved team accounts. */
export default function MembreLayout({ children }) {
  return (
    <StaffGate>
      <StaffDataProvider>
        <EspaceShell>{children}</EspaceShell>
      </StaffDataProvider>
    </StaffGate>
  );
}
