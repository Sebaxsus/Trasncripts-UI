// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

const API_BASE_URL = process.env.PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()]
  },
  security: {
    // CSP nativa de Astro: calcula hashes para los scripts/estilos que Astro
    // mismo bundlea (incluido el bootstrap de hidratación de client:load),
    // que un script-src 'self' hecho a mano bloqueaba silenciosamente.
    // Solo activa en build/preview (Astro la desactiva en dev por el propio
    // dev server de Vite) — coherente con la decisión de CSP estricta solo
    // en producción.
    csp: {
      directives: [
        "default-src 'self'",
        `connect-src 'self' ${API_BASE_URL}`,
        "img-src 'self' data:",
        // blob: para SegmentPlayButton (fetch + blob + URL.createObjectURL,
        // necesario porque el endpoint de audio requiere header Authorization).
        // mdstrm.com/*.cdn.mdstrm.com para RadioPlayer (stream público de
        // El Sol Barranquilla, sin auth — ver lib/radio.ts).
        "media-src 'self' blob: https://mdstrm.com https://*.cdn.mdstrm.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ]
    }
  }
});
