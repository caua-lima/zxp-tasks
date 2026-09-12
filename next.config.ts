import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança básicos — o app não tinha nenhum além do HSTS que
 * a própria Vercel já aplica. Conservadora de propósito: `script-src` e
 * `style-src` continuam permitindo inline porque o hydration do Next/React
 * e o Tailwind dependem disso, e travar isso sem testar cada rota corre o
 * risco de quebrar o login (o único jeito de entrar no próprio app). O que
 * fecha de verdade é `connect-src` (só o próprio site e o Supabase — nem
 * XHR/fetch/WebSocket vão pra qualquer outro lugar) e `frame-ancestors`
 * (ninguém consegue exibir o app dentro de um iframe alheio).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
