import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Fallback for Sequel Sans, which is licensed and therefore not in the repo.
 * Inter is the closest free grotesque and shares Sequel's metrics closely
 * enough that nothing reflows when the licensed files are dropped into
 * /public/fonts. See the @font-face block in globals.css.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Strive Media",
  description: "Content review and approvals",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // The portal is used one-handed on phones; let people zoom the artwork.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
