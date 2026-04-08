import PageEditor from "@/src/components/dashboard/PageEditor";

export default async function DashboardPageEditorRoute({ params }) {
  const resolved = await params;
  return <PageEditor pageId={resolved?.pageId} />;
}
