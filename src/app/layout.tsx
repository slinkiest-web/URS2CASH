import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins, Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * urs2cash-ui skill, Typography (Revision 2): the bold rounded geometric
 * sans for headings and prices, replacing the Fraunces serif. `preload:
 * false` per the skill's "never block first paint on the display face" —
 * only the body face (Inter) preloads.
 */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  preload: false,
});

/** urs2cash-ui skill, Typography: the body/UI grotesque. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Urs2Cash",
  description: "Peer-to-peer recommerce marketplace for Nigeria.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PostHogProvider>
          <SiteHeader />
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
