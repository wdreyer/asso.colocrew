"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";
import { staffAuthErrorMessage, useStaffAuth } from "@/src/contexts/StaffAuthContext";
import { personName } from "@/src/components/espace/format";
import { Card, InfoGrid, Notice, PageHeader, SectionTitle, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/src/components/espace/ui";

/**
 * Fields the member may edit on their own staff_members document. Name, e-mail, social security
 * number, post and document statuses stay managed by ColoCrew (and are refused by the rules).
 */
const EDITABLE_FIELDS = [
  { key: "phone", label: "Téléphone", type: "tel", autoComplete: "tel" },
  { key: "address", label: "Adresse complète", placeholder: "N°, voie, code postal et ville", autoComplete: "street-address" },
  { key: "dateOfBirth", label: "Date de naissance", placeholder: "JJ/MM/AAAA", autoComplete: "bday" },
  { key: "birthPlace", label: "Lieu de naissance", placeholder: "Ville et pays si nécessaire" },
  { key: "nationality", label: "Nationalité", placeholder: "Française" },
];

export default function ProfilPage() {
  const { member, memberId, user, account, resetPassword, signOut } = useStaffAuth();
  const [form, setForm] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(Object.fromEntries(EDITABLE_FIELDS.map(({ key }) => [key, member?.[key] || ""])));
  }, [member]);

  const dirty = EDITABLE_FIELDS.some(({ key }) => String(form[key] || "") !== String(member?.[key] || ""));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const values = Object.fromEntries(EDITABLE_FIELDS.map(({ key }) => [key, String(form[key] || "").trim()]));
      await updateDoc(doc(db, COLLECTIONS.STAFF_MEMBERS, memberId), { ...values, updatedAt: serverTimestamp() });
      setMessage({ tone: "success", text: "Profil enregistré." });
    } catch (error) {
      setMessage({ tone: "danger", text: staffAuthErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async () => {
    try {
      await resetPassword(user?.email || "");
      setMessage({ tone: "success", text: `Un lien pour changer de mot de passe a été envoyé à ${user?.email}.` });
    } catch (error) {
      setMessage({ tone: "danger", text: staffAuthErrorMessage(error) });
    }
  };

  return (
    <>
      <PageHeader eyebrow="Mon compte" title="Profil">
        Garde tes coordonnées à jour : elles servent à préparer tes contrats et à te joindre pendant les séjours.
      </PageHeader>

      <Card>
        <InfoGrid items={[
          ["Nom", personName(member) || personName(account)],
          ["E-mail de connexion", user?.email],
        ]} />
        <p className="mt-3 text-xs text-[#8a7b99]">Pour corriger ton nom ou ton n° de Sécurité sociale, écris à info@colocrew.com.</p>
      </Card>

      <SectionTitle>Coordonnées</SectionTitle>
      <Card>
        <form onSubmit={save} className="space-y-4">
          {EDITABLE_FIELDS.map((field) => (
            <div key={field.key}>
              <label className={labelClass} htmlFor={field.key}>{field.label}</label>
              <input
                id={field.key}
                type={field.type || "text"}
                className={inputClass}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                value={form[field.key] || ""}
                onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.value }))}
              />
            </div>
          ))}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <button type="submit" className={`${buttonPrimary} w-full sm:w-auto`} disabled={!dirty || saving || !memberId}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </Card>

      <SectionTitle>Sécurité</SectionTitle>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={sendReset} className={buttonSecondary}>Changer mon mot de passe</button>
        <button type="button" onClick={signOut} className={buttonSecondary}>Se déconnecter</button>
      </div>
    </>
  );
}
