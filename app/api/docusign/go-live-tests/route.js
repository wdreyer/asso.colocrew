import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";
import { sendDocusignEnvelopeBatch } from "@/src/lib/docusignServer";

export const runtime = "nodejs";
export const maxDuration = 60;

function testHtml(email, index, total) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:Arial;padding:45px;color:#1e123d}.signature{margin-top:80px;color:#fff;font-size:1px}</style></head><body><h1>Test API DocuSign ${index}/${total}</h1><p>Enveloppe technique ColoCrew destinée à la validation Go Live.</p><p>Destinataire : <strong>${email}</strong></p><p>Aucune valeur contractuelle.</p><div class="signature">/colocrew-go-live-signature/</div></body></html>`;
}

export async function POST(request) {
  try {
    await requireFirebaseAdmin(request);
    const authServer = String(process.env.DOCUSIGN_AUTH_SERVER || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (authServer !== "account-d.docusign.com") {
      throw new Error("Les tests Go Live sont autorisés uniquement dans l'environnement DocuSign Demo.");
    }
    const email = String(process.env.DOCUSIGN_ADMIN_EMAIL || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("DOCUSIGN_ADMIN_EMAIL est invalide.");

    const total = 20;
    const envelopes = Array.from({ length: total }, (_, offset) => {
      const index = offset + 1;
      return {
        subject: `[TEST GO LIVE ${index}/${total}] ColoCrew`,
        html: testHtml(email, index, total),
        documentName: `Test Go Live ColoCrew ${index}.html`,
        signers: [{
          email,
          name: "Association ColoCrew",
          anchor: "/colocrew-go-live-signature/",
          emailBody: `Test technique DocuSign ${index}/${total} pour la validation Go Live ColoCrew.`,
        }],
      };
    });
    const results = await sendDocusignEnvelopeBatch(envelopes, 4);
    return Response.json({ ok: true, sent: results.length, recipient: email });
  } catch (error) {
    if (error?.status) return adminErrorResponse(error);
    return Response.json({ ok: false, error: error?.message || "Tests Go Live impossibles." }, { status: 500 });
  }
}
