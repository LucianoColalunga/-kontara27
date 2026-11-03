import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    lang: "es",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F5F6F8",
    theme_color: "#0B1A2E",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Nuevo movimiento", url: "/app?accion=nuevo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
