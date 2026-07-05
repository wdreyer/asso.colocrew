import { docusignConsentUrl } from "@/src/lib/docusignServer";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.redirect(docusignConsentUrl(), 302);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
