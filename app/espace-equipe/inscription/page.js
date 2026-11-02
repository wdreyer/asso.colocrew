"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaffAuth } from "@/src/contexts/StaffAuthContext";
import AuthFrame from "@/src/components/espace/AuthFrame";
import RequestForm from "@/src/components/espace/RequestForm";

export default function InscriptionPage() {
  const { status, signUp } = useStaffAuth();
  const router = useRouter();

  // After sign-up the account is "pending": /espace-equipe shows the waiting page.
  useEffect(() => {
    if (status !== "loading" && status !== "signedOut") router.replace("/espace-equipe");
  }, [status, router]);

  return (
    <AuthFrame
      title="Créer mon compte"
      footer={<>Déjà un compte ? <Link href="/espace-equipe/connexion" className="font-bold text-[#B8336A]">Se connecter</Link></>}
    >
      <p className="mb-5 text-sm leading-relaxed text-[#5b4d6b]">
        Réservé aux animateur·rices et directeur·rices de ColoCrew. Votre demande sera validée par un
        responsable avant l’ouverture de votre espace.
      </p>
      <RequestForm withPassword onSubmit={signUp} submitLabel="Créer mon compte" />
    </AuthFrame>
  );
}
