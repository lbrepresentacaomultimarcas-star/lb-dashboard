import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DataLoader } from "@/components/data-loader";
import { ToastHost } from "@/components/toast-host";
import { ThemeBoot } from "@/components/theme-toggle";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = "https://lb-dashboard-virid.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "LB Dashboard",
  title: {
    default: "LB Representações — Dashboard",
    template: "%s · LB Dashboard",
  },
  description:
    "Sistema de gestão de vendas, pipeline, metas e comissões da LB Representações.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LB Dashboard",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "LB Dashboard",
    title: "LB Representações — Dashboard",
    description:
      "Sistema de gestão de vendas, pipeline, metas e comissões.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "LB Representações" }],
  },
  twitter: {
    card: "summary",
    title: "LB Representações — Dashboard",
    description: "Gestão de vendas, pipeline, metas e comissões.",
    images: ["/icon-512.png"],
  },
  robots: { index: false, follow: false }, // sistema interno — não indexar
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <ThemeBoot />
        <DataLoader>{children}</DataLoader>
        <ToastHost />
        <PwaRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
