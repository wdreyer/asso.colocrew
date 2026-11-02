import { redirect } from "next/navigation";

// Les fiches de convoyage sont désormais dans l'espace équipe, par personne.
export default function ConvoyagesRedirect() {
  redirect("/espace-equipe/convoyages");
}
