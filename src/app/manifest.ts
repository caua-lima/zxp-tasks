import type { MetadataRoute } from "next";

// Convenção de arquivo do Next.js: isto vira /manifest.webmanifest e é
// linkado no <head> automaticamente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZXP Tasks",
    short_name: "ZXP Tasks",
    description:
      "Cronograma do dia com cronômetro e seus objetivos. Um produto ZXP Solutions.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#10100E",
    theme_color: "#10100E",
    icons: [
      { src: "/manifest-icon-192", sizes: "192x192", type: "image/png" },
      { src: "/manifest-icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
