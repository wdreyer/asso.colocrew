const BREVO = "https://api.brevo.com/v3";

function h() {
  return { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" };
}

export async function GET(_, context) {
  const { id } = await context.params;
  const res = await fetch(`${BREVO}/emailCampaigns/${id}`, { headers: h() });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(_, context) {
  const { id } = await context.params;
  const res = await fetch(`${BREVO}/emailCampaigns/${id}`, {
    method: "DELETE",
    headers: h(),
  });
  if (res.status === 204) return Response.json({ ok: true });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
