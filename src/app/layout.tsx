import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { cookies } from "next/headers";
import { brand } from "@/config/brand";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import "./globals.css";

// Fuentes autoalojadas por Next.js en el build: el navegador no consulta a Google (sin rastreo de terceros).
const ui = Manrope({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const display = Sora({ subsets: ["latin"], variable: "--font-brand", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.shortName}` },
  description: brand.description,
  applicationName: brand.shortName,
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/favicon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#08101c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Preferencia de tema elegida por el usuario (cookie funcional). Sin cookie: sigue al sistema.
  const theme = (await cookies()).get("theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  return (
    <html lang="es" data-theme={dataTheme} className={`${ui.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
