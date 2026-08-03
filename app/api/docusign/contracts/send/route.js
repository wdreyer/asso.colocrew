import { generateContractHTML } from "@/src/lib/contractTemplate";
import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";
import { sendDocusignEnvelope } from "@/src/lib/docusignServer";

export const runtime = "nodejs";

function cleanText(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function positiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function sanitizedMember(input) {
  return {
    firstName: cleanText(input?.firstName, 100),
    lastName: cleanText(input?.lastName, 100),
    email: cleanText(input?.email, 250),
    phone: cleanText(input?.phone, 50),
    address: cleanText(input?.address, 400),
    dateOfBirth: cleanText(input?.dateOfBirth, 50),
    birthPlace: cleanText(input?.birthPlace, 150),
    socialSecurityNumber: cleanText(input?.socialSecurityNumber, 50),
    nationality: cleanText(input?.nationality, 100),
  };
}

function sanitizedContract(input) {
  return {
    role: cleanText(input?.role, 150),
    roleKey: cleanText(input?.roleKey, 50),
    stay: cleanText(input?.stay, 150),
    stayName: cleanText(input?.stayName || input?.stay, 150),
    stayCode: cleanText(input?.stayCode, 50),
    week: cleanText(input?.week, 30),
    startDate: cleanText(input?.startDate, 30),
    endDate: cleanText(input?.endDate, 30),
    netSalary: Number(input?.netSalary) || 0,
    grossSalary: Number(input?.grossSalary) || 0,
    primeCount: Math.max(Number(input?.primeCount) || 0, 0),
    primeUnitNet: positiveAmount(input?.primeUnitNet),
    primeUnitGross: positiveAmount(input?.primeUnitGross),
  };
}

function isVolunteerContract(contract) {
  const key = String(contract?.roleKey || "").trim().toLowerCase();
  const role = String(contract?.role || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return key === "benevole" || role.includes("benevol");
}

const DOCUSIGN_PERSONAL_FIELDS = [
  {
    key: "phone", tabLabel: "cc_phone", anchor: "/cc-field-phone/", width: 165,
    valid: (value) => String(value || "").replace(/\D/g, "").length >= 8,
    validationPattern: "^[0-9 +().-]{8,25}$",
    validationMessage: "Saisissez un numéro de téléphone valide.",
  },
  {
    key: "address", tabLabel: "cc_address", anchor: "/cc-field-address/", width: 285,
    valid: (value) => String(value || "").trim().length >= 8,
  },
  {
    key: "dateOfBirth", tabLabel: "cc_birth_date", anchor: "/cc-field-birth-date/", width: 105,
    valid: (value) => String(value || "").trim().length >= 8,
  },
  {
    key: "birthPlace", tabLabel: "cc_birth_place", anchor: "/cc-field-birth-place/", width: 185,
    valid: (value) => String(value || "").trim().length >= 2,
  },
  {
    key: "socialSecurityNumber", tabLabel: "cc_social_security", anchor: "/cc-field-social-security/", width: 215,
    valid: (value) => String(value || "").replace(/\D/g, "").length === 15,
    validationPattern: "^(?:[0-9][ .-]?){14}[0-9]$",
    validationMessage: "Saisissez votre numéro de Sécurité sociale complet (15 chiffres).",
  },
  {
    key: "nationality", tabLabel: "cc_nationality", anchor: "/cc-field-nationality/", width: 135,
    valid: (value) => String(value || "").trim().length >= 2,
  },
];

export async function POST(request) {
  try {
    await requireFirebaseAdmin(request);
    const body = await request.json();
    const member = sanitizedMember(body?.member);
    const contract = sanitizedContract(body?.contract);
    const adminEmail = cleanText(process.env.DOCUSIGN_ADMIN_EMAIL, 250);
    const adminName = cleanText(process.env.DOCUSIGN_ADMIN_NAME || "Association ColoCrew", 150);

    if (!member.firstName || !member.lastName) throw new Error("Nom de l'animateur·ice manquant.");
    if (!/^\S+@\S+\.\S+$/.test(member.email)) throw new Error("Adresse e-mail de l'animateur·ice invalide.");
    if (!/^\S+@\S+\.\S+$/.test(adminEmail)) throw new Error("DOCUSIGN_ADMIN_EMAIL est invalide.");
    if (!contract.startDate || !contract.endDate) throw new Error("Dates du contrat manquantes.");

    const fullName = `${member.firstName} ${member.lastName}`.trim();
    const stayLabel = [contract.stayCode || contract.stay, contract.week].filter(Boolean).join(" — ");
    const isVolunteer = isVolunteerContract(contract);
    const personalFields = isVolunteer
      ? DOCUSIGN_PERSONAL_FIELDS.filter((field) => field.key !== "socialSecurityNumber")
      : DOCUSIGN_PERSONAL_FIELDS;
    const documentLabel = isVolunteer ? "Convention de bénévolat" : "Contrat d'engagement éducatif";
    const memberForDocument = { ...member };
    const missingPersonalFields = personalFields.filter((field) => !field.valid(member[field.key]));
    missingPersonalFields.forEach((field) => { memberForDocument[field.key] = ""; });
    const staffTextTabs = missingPersonalFields.map((field) => ({
      anchor: field.anchor,
      tabLabel: field.tabLabel,
      width: field.width,
      value: "",
      required: true,
      validationPattern: field.validationPattern,
      validationMessage: field.validationMessage,
    }));
    const result = await sendDocusignEnvelope({
      html: generateContractHTML(memberForDocument, contract),
      subject: `${documentLabel} ColoCrew - ${fullName}`,
      emailBlurb: `Bonjour ${member.firstName}, merci de verifier puis signer votre ${isVolunteer ? "convention de benevolat" : "contrat"} ColoCrew. Une fois votre signature terminee, ColoCrew le contresignera.`,
      documentName: `${isVolunteer ? "Convention benevolat" : "Contrat CEE"} - ${fullName}${stayLabel ? ` - ${stayLabel}` : ""}.html`,
      signers: [
        {
          email: member.email,
          name: fullName,
          anchor: "/cc-staff-signature/",
          textTabs: staffTextTabs,
          emailBody: `Bonjour ${member.firstName}, merci de vérifier puis signer votre contrat d'engagement éducatif ColoCrew. Une fois votre signature terminée, ColoCrew le contresignera.`,
        },
        {
          email: adminEmail,
          name: adminName,
          anchor: "/cc-organizer-signature/",
          emailBody: `Le contrat de ${fullName} a été signé par l'animateur·ice. Merci de le vérifier puis de le contresigner pour ColoCrew.`,
        },
      ],
    });

    return Response.json({
      ok: true,
      ...result,
      recipient: member.email,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.status) return adminErrorResponse(error);
    return Response.json({
      ok: false,
      error: error?.message || "Envoi DocuSign impossible.",
      code: error?.code || "",
      consentUrl: error?.code === "consent_required" ? "/api/docusign/consent" : "",
    }, { status: 500 });
  }
}
