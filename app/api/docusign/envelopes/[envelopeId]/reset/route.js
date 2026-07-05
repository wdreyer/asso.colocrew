import { requireFirebaseAdmin, adminErrorResponse } from "@/src/lib/serverAdminAuth";
import { voidDocusignEnvelope } from "@/src/lib/docusignServer";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    await requireFirebaseAdmin(request);
    const { envelopeId } = await params;
    if (!envelopeId) throw new Error("Numéro d'enveloppe manquant.");
    const result = await voidDocusignEnvelope(
      envelopeId,
      "Contrat réinitialisé depuis le dashboard RH ColoCrew.",
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error?.status) return adminErrorResponse(error);
    return Response.json({ ok: false, error: error?.message || "Réinitialisation DocuSign impossible." }, { status: 500 });
  }
}
