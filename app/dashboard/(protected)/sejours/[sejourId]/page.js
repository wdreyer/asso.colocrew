import SejourDetail from "@/src/components/dashboard/SejourDetail";

export default async function SejourDetailPage({ params }) {
  const resolved = await params;
  return <SejourDetail sejourId={resolved?.sejourId} />;
}
