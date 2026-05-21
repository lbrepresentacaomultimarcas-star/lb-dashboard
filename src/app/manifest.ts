import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LB Representações — Dashboard",
    short_name: "LB Dashboard",
    description:
      "Sistema de gestão de vendas, pipeline, metas e comissões da LB Representações.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Atalhos rápidos (long-press no ícone do app)
    shortcuts: [
      {
        name: "Pipeline de Negócios",
        short_name: "Pipeline",
        url: "/leads",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Ranking de Vendas",
        short_name: "Ranking",
        url: "/ranking",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Nova Venda",
        short_name: "Vendas",
        url: "/vendas",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
