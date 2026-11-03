import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Paquetes con binarios nativos o WASM: se cargan desde node_modules en el servidor.
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer", "pg", "embedded-postgres"],
  experimental: {
    serverActions: {
      // Las importaciones de planillas pasan por route handlers; las Server Actions solo reciben formularios.
      bodySizeLimit: "2mb",
    },
  },
  // Las cabeceras de seguridad que dependen del request (CSP con nonce) se fijan en src/proxy.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
