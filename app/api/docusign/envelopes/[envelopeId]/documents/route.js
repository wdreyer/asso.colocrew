import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";
import { downloadDocusignEnvelopePdf } from "@/src/lib/docusignServer";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    await requireFirebaseAdmin(request);
    const { envelopeId } = await params;
    if (!envelopeId) throw new Error("Numéro d'enveloppe manquant.");
    const pdf = await downloadDocusignEnvelopePdf(envelopeId);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contrat-signe-${envelopeId}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error?.status) return adminErrorResponse(error);
    return Response.json({ ok: false, error: error?.message || "PDF signé indisponible." }, { status: 500 });
  }
}
