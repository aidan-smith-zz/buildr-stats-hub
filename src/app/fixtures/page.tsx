import { redirect } from "next/navigation";
import { todayDateKey } from "@/lib/slugs";

/** /fixtures redirects to today's fixtures date page. */
export default function FixturesPage() {
  redirect(`/fixtures/${todayDateKey()}`);
}
