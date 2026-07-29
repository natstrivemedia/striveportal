import { redirect } from "next/navigation";

/**
 * Legacy deep link. Editing now happens in a modal over the month calendar, so
 * old bookmarks and email links land on the calendar with that post open rather
 * than on a separate page that has since lost its editor.
 */
export default async function LegacyItemPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  redirect(`/admin/c/${slug}?post=${id}`);
}
