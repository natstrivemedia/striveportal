import { redirect } from "next/navigation";
import { createSession, isAdmin, verifyAdminPassword } from "@/lib/auth";

export const metadata = { title: "Sign in · Strive Media" };

async function signIn(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminPassword(password)) redirect("/login?error=1");
  await createSession();
  redirect("/admin");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-h1 font-bold text-ink-900">Strive Media</h1>
          <p className="mt-1 text-body text-ink-500">Client portal admin</p>
        </div>

        <form
          action={signIn}
          className="rounded-[20px] border border-ink-200 bg-white p-6 shadow-lift"
        >
          <label
            htmlFor="password"
            className="block text-body font-medium text-ink-700"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-body outline-none focus:border-ink-900 focus:bg-white"
          />
          {error && (
            <p className="mt-2 text-body text-stop-600">That password didn&apos;t match.</p>
          )}
          <button
            type="submit"
            className="mt-4 w-full rounded-full bg-ink-950 py-3 text-body font-semibold text-white transition active:scale-[0.99]"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-small text-ink-400">
          Clients don&apos;t sign in — they use their own portal link.
        </p>
      </div>
    </main>
  );
}
