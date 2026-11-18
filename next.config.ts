import type { NextConfig } from "next";

/** Proteções padrão do navegador, em todas as páginas. */
const cabecalhosDeSeguranca = [
  // Nenhum outro site pode mostrar o sistema dentro de uma moldura (evita cliques enganados).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // O navegador não tenta "adivinhar" o tipo dos arquivos.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ao clicar num link para fora (ex.: WhatsApp), o outro site não recebe o endereço completo da página.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // O sistema não usa câmera, microfone nem localização.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Sempre HTTPS (conexão protegida).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
