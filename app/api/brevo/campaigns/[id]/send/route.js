export async function POST(_, context) {
  const { id } = await context.params;
  const res = await fetch(`https://api.brevo.com/v3/emailCampaigns/${id}/sendNow`, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" },
  });
  if (res.status === 204) return Response.json({ ok: true });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
