import { redirect } from "next/navigation";

// Le dépôt public de documents est remplacé par l'espace équipe (compte validé).
export default function RhRedirect() {
  redirect("/espace-equipe/documents");
}
