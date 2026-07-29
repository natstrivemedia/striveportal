import { requireAdmin, destroySession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/toast";
import { Sidebar } from "@/components/admin/Sidebar";
import { listClients, pendingCount } from "@/lib/queries";
import { getWorkspace } from "@/lib/workspace";
import { one } from "@/lib/db";

async function signOut() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const [clients, ws] = await Promise.all([listClients(), getWorkspace()]);
  const withPending = await Promise.all(
    clients.map(async (c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      brand_color: c.brand_color,
      portal_token: c.portal_token,
      pending: await pendingCount(c.id),
      hasLogo: Boolean(c.logo_path),
    })),
  );

  // Mirrors the plan counter in the tool this replaces — posts that exist,
  // against a soft monthly ceiling.
  const total = await one<{ n: string }>`
    select count(*)::text as n from items
    where created_at >= date_trunc('month', now())
  `;

  return (
    <ToastProvider>
      {/* The app floats on a warm plane: sidebar shares the plane colour, and
          the content is a white panel rounded away from it. */}
      {/* Branding comes from the database, so these are inline vars rather than
          build-time tokens — changing a colour must not need a redeploy. */}
      <div
        className="flex min-h-screen p-3"
        style={
          {
            background: ws.page_bg,
            "--brand": ws.accent,
            "--sidebar-bg": ws.sidebar_bg,
          } as React.CSSProperties
        }
      >
        <Sidebar clients={withPending} workspace={{ name: ws.name, hasLogo: Boolean(ws.logo_path) }} />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-panel">
          {/* Spec: 24px page gutters. */}
          <header className="flex items-center justify-end border-b border-ink-200 px-gutter py-2">
            <form action={signOut}>
              <button
                type="submit"
                className="nav-row text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              >
                Sign out
              </button>
            </form>
          </header>
          <main className="flex-1 overflow-x-hidden px-gutter py-gutter">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
