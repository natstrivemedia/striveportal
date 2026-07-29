import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";

/**
 * The root is a staff entrance only. Clients never land here — they arrive at
 * /p/<token> directly from an email or a text message.
 */
export default async function Root() {
  redirect((await isAdmin()) ? "/admin" : "/login");
}
