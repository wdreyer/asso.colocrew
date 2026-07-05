import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";
import { sendDocusignEnvelope } from "@/src/lib/docusignServer";

export const runtime = "nodejs";

function testContractHtml(email) {
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date());
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:Arial;color:#1e123d;padding:45px;line-height:1.5}h1{color:#bd2f6d}.box{border:1px solid #ddd;border-radius:12px;padding:22px;margin:25px 0}.signature{margin-top:70px;color:#fff;font-size:8px}</style></head><body><h1>Test de connexion DocuSign — ColoCrew</h1><div class="box"><p>Ce document confirme que le site ColoCrew peut créer et envoyer une enveloppe DocuSign.</p><p>Date du test : <strong>${date}</strong><br>Destinataire : <strong>${email}</strong></p></div><p>Aucune valeur contractuelle : il s'agit uniquement d'un test technique.</p><div class="signature">/colocrew-admin-signature/</div></body></html>`;
}

export async function POST(request) {
  try {
    await requireFirebaseAdmin(request);
    const email = String(process.env.DOCUSIGN_ADMIN_EMAIL || "").trim();
    if (!email) throw new Error("Variable Vercel manquante : DOCUSIGN_ADMIN_EMAIL");
    const result = await sendDocusignEnvelope({
      subject: "[TEST] Connexion DocuSign — ColoCrew",
      html: testContractHtml(email),
      signers: [{
        email,
        name: "Association ColoCrew",
        anchor: "/colocrew-admin-signature/",
      }],
    });
    return Response.json({ ok: true, ...result, recipient: email });
  } catch (error) {
    if (error?.status) return adminErrorResponse(error);
    return Response.json({
      ok: false,
      error: error?.message || "Test DocuSign impossible.",
      code: error?.code || "",
      consentUrl: error?.code === "consent_required" ? "/api/docusign/consent" : "",
    }, { status: 500 });
  }
}
