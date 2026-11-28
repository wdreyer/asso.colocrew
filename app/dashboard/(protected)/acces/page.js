import { redirect } from "next/navigation";

// Ancienne adresse : les droits d'accès sont maintenant dans l'espace RH.
export default function DashboardLegacyAccessPage() {
  redirect("/dashboard/rh/acces");
}
