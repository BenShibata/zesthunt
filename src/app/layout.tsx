import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zesthunt: what to eat, in seconds",
  description: "Opens straight onto a meal pick near you. No login, nothing saved.",
  referrer: "no-referrer",
  // Proves to impact.com (the referral network) that this site is ours. Public by design.
  // The same line is served as plain text at /impact-site-verification.txt.
  other: { "impact-site-verification": ["b51f39a1-b9fa-4005-a67f-46a42860d8a5", "79cb59df-f3e3-4b8b-a465-ae372068cdb4"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b0c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${inter.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
