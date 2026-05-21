import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DataLoader } from "@/components/data-loader";
import { ToastHost } from "@/components/toast-host";
import { ThemeBoot } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LB Dashboard",
  description: "Sistema de gestão de vendas, vendedores, clientes e leads",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <ThemeBoot />
        <DataLoader>{children}</DataLoader>
        <ToastHost />
      </body>
    </html>
  );
}
