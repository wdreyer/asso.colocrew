import { StaffAuthProvider } from "@/src/contexts/StaffAuthContext";

export const metadata = {
  title: "Espace équipe — ColoCrew",
  description: "Plannings, convoyages, contrats et documents des équipes ColoCrew.",
  robots: { index: false, follow: false },
};

export default function EspaceEquipeLayout({ children }) {
  return <StaffAuthProvider>{children}</StaffAuthProvider>;
}
