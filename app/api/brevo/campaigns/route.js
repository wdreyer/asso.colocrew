const BREVO = "https://api.brevo.com/v3";

function h() {
  return { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" };
}

export async function GET() {
  const res = await fetch(`${BREVO}/emailCampaigns?limit=50&sort=desc`, { headers: h() });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(request) {
  const body = await request.json();
  const res = await fetch(`${BREVO}/emailCampaigns`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
