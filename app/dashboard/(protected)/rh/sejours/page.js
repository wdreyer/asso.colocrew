import { redirect } from "next/navigation";

// Ancienne page « Affectations séjours » : c'est maintenant le filtre par session du tableau Équipe.
export default function DashboardLegacyAssignmentsPage() {
  redirect("/dashboard/rh/equipe");
}
