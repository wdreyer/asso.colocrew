import { generateContractHTML } from "@/src/lib/contractTemplate";
import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";
import { sendDocusignEnvelope } from "@/src/lib/docusignServer";

export const runtime = "nodejs";

function cleanText(value, max = 300) {
  return String(value || "").trim().slice(0, max);
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
  };
}

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
    const result = await sendDocusignEnvelope({
      subject: `Contrat d'engagement éducatif ColoCrew — ${fullName}`,
      emailBlurb: `Bonjour ${member.firstName}, merci de vérifier puis signer votre contrat ColoCrew. Une fois votre signature terminée, ColoCrew le contresignera.`,
      html: generateContractHTML(member, contract),
      documentName: `Contrat CEE - ${fullName}${stayLabel ? ` - ${stayLabel}` : ""}.html`,
      signers: [
        { email: member.email, name: fullName, anchor: "/cc-staff-signature/" },
        { email: adminEmail, name: adminName, anchor: "/cc-organizer-signature/" },
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
