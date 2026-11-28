import { withDashboardAccess } from "@/src/lib/serverAdminAuth";
const BREVO = "https://api.brevo.com/v3";

function h() {
  return { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" };
}

async function handleGET() {
  const res = await fetch(`${BREVO}/emailCampaigns?limit=50&sort=desc`, { headers: h() });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

async function handlePOST(request) {
  const body = await request.json();
  const res = await fetch(`${BREVO}/emailCampaigns`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export const GET = withDashboardAccess(["campaigns"], handleGET);
export const POST = withDashboardAccess(["campaigns"], handlePOST);
