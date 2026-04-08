import SejourDetail from "@/src/components/dashboard/SejourDetail";

export default function SejourDetailPage({ params }) {
  return <SejourDetail sejourId={params.sejourId} />;
}
