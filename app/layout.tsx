import type { Metadata, Viewport } from "next";
import { Anton, Saira_Condensed, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const sairaCondensed = Saira_Condensed({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-saira",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fantasy WC 2026",
  description: "Fantasy football for the 2026 World Cup",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0e1726",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${sairaCondensed.variable} ${inter.variable} h-full`}
    >
      <head>
        <link rel="preconnect" href="https://ihwsprtjkpvujjxsedcz.supabase.co" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0e1726" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="h-full font-[family-name:var(--font-inter)]">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
