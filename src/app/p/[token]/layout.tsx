import type { Metadata } from "next";
import { requireClient } from "@/lib/portal";
import { pendingCount } from "@/lib/queries";
import { ToastProvider } from "@/components/toast";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { PortalTabs } from "@/components/portal/PortalTabs";
import { readableOn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Content review",
  robots: { index: false, follow: false },
};

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await requireClient(token);
  const pending = await pendingCount(client.id);

  return (
    <div
      className="flex min-h-full flex-col bg-ink-50"
      // Each portal is tinted with the client's own brand colour; every
      // `brand`-prefixed utility in the subtree resolves against this.
      style={
        {
          "--brand": client.brand_color,
          "--brand-on": readableOn(client.brand_color),
        } as React.CSSProperties
      }
    >
      <ToastProvider>
        <PortalHeader client={client} token={token} />
        <PortalTabs token={token} pending={pending} />
        {children}
      </ToastProvider>
    </div>
  );
}
