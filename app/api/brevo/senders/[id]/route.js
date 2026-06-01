export async function DELETE(_, context) {
  const { id } = await context.params;
  const res = await fetch(`https://api.brevo.com/v3/senders/${id}`, {
    method: "DELETE",
    headers: { "api-key": process.env.BREVO_API_KEY },
  });
  if (res.status === 204) return Response.json({ ok: true });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
