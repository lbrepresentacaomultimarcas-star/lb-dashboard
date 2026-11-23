import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DataLoader } from "@/components/data-loader";
import { ToastHost } from "@/components/toast-host";
import { ThemeBoot } from "@/components/theme-toggle";
import { PwaRegister } from "@/components/pwa-register";
import { TemaVisualGlobal } from "@/components/tema-visual";
import { SCRIPT_BOOT_TEMA } from "@/lib/tema-visual";
import "./globals.css";
import "./temas-visuais.css";
import "./ranking-premium.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// preload: false — só baixam quando o tema correspondente está ativo.
const fonteNeon = Chakra_Petch({ variable: "--font-lbx-neon", subsets: ["latin"], weight: ["600", "700"], preload: false });
const fonteNatal = Playfair_Display({ variable: "--font-lbx-natal", subsets: ["latin"], weight: ["700"], preload: false });

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
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${fonteNeon.variable} ${fonteNatal.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_BOOT_TEMA }} />
      </head>
      <body className="min-h-full">
        <ThemeBoot />
        <TemaVisualGlobal />
        <DataLoader>{children}</DataLoader>
        <ToastHost />
        <PwaRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
