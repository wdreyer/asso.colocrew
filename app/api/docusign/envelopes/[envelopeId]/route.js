import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";
import { getDocusignEnvelope } from "@/src/lib/docusignServer";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    await requireFirebaseAdmin(request);
    const { envelopeId } = await params;
    if (!envelopeId) throw new Error("Numéro d'enveloppe manquant.");
    const result = await getDocusignEnvelope(envelopeId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error?.status) return adminErrorResponse(error);
    return Response.json({ ok: false, error: error?.message || "Statut DocuSign indisponible." }, { status: 500 });
  }
}
