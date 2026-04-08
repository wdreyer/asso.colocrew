import { redirect } from "next/navigation";

export default async function LegacyBlogSlugRedirect({ params }) {
  const resolved = await params;
  const slug = String(resolved?.slug || "").trim();
  if (!slug) {
    redirect("/blog");
  }
  redirect(`/${encodeURIComponent(slug)}`);
}
