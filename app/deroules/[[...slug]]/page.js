import { redirect } from "next/navigation";

// Anciennes adresses /deroules et /deroules/{séjour}/{semaine} : les déroulés se consultent
// dans l'espace équipe, session par session.
export default function DeroulesRedirect() {
  redirect("/espace-equipe/planning");
}
