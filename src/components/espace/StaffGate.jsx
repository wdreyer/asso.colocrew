"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaffAuth } from "@/src/contexts/StaffAuthContext";
import AuthFrame from "./AuthFrame";
import RequestForm from "./RequestForm";
import { Loader, buttonPrimary, buttonSecondary } from "./ui";

/** Shows the team space only to approved accounts; every other state gets its own screen. */
export default function StaffGate({ children }) {
  const { status, user, account, signOut, completeRequest } = useStaffAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signedOut") router.replace("/espace-equipe/connexion");
  }, [status, router]);

  if (status === "loading" || status === "signedOut") {
    return <main className="min-h-screen bg-[#f8f2fb] pt-28"><Loader /></main>;
  }

  const logout = <button type="button" onClick={signOut} className="font-bold text-[#B8336A]">Se déconnecter</button>;

  if (status === "admin") {
    return (
      <AuthFrame title="Vous êtes administrateur" footer={logout}>
        <p className="text-sm leading-relaxed text-[#5b4d6b]">
          Cet espace est réservé aux animateur·rices et directeur·rices. Les comptes, contrats, plannings
          et convoyages se gèrent depuis le tableau de bord.
        </p>
        <Link href="/dashboard" className={`${buttonPrimary} mt-5 w-full`}>Aller au tableau de bord</Link>
      </AuthFrame>
    );
  }

  if (status === "noAccount") {
    return (
      <AuthFrame title="Finaliser ma demande" footer={logout}>
        <p className="mb-4 text-sm leading-relaxed text-[#5b4d6b]">
          Votre compte <strong>{user?.email}</strong> existe mais la demande d’accès n’a pas été envoyée.
          Complétez-la pour qu’un responsable la valide.
        </p>
        <RequestForm onSubmit={completeRequest} submitLabel="Envoyer ma demande" />
      </AuthFrame>
    );
  }

  if (status === "pending") {
    return (
      <AuthFrame title="Demande en cours de validation" footer={logout}>
        <div className="space-y-3 text-sm leading-relaxed text-[#5b4d6b]">
          <p>
            Merci {account?.firstName || ""} ! Votre demande d’accès a bien été reçue. Un responsable ColoCrew
            doit la valider et la relier à votre dossier.
          </p>
          <p>
            Cette page s’ouvrira automatiquement dès la validation : vous pourrez alors consulter vos plannings,
            vos convoyages, vos contrats et déposer vos documents.
          </p>
          <p className="rounded-xl bg-[#f8f2fb] px-4 py-3 text-xs">
            Compte : <strong>{user?.email}</strong>
          </p>
        </div>
      </AuthFrame>
    );
  }

  if (status === "rejected") {
    return (
      <AuthFrame title="Accès non disponible" footer={logout}>
        <p className="text-sm leading-relaxed text-[#5b4d6b]">
          Votre compte n’a pas (ou plus) accès à l’espace équipe. Si vous pensez qu’il s’agit d’une erreur,
          écrivez-nous à <a className="font-bold text-[#B8336A]" href="mailto:info@colocrew.com">info@colocrew.com</a>.
        </p>
        <Link href="/" className={`${buttonSecondary} mt-5 w-full`}>Retour au site</Link>
      </AuthFrame>
    );
  }

  return children;
}
