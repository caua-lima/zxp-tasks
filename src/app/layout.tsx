import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

// Inter no operacional; Sora nos números e títulos de impacto.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZXP Tasks",
  description: "Kanban pessoal por tópicos, com mapa mental das tarefas. Um produto ZXP Solutions.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZXP Tasks",
  },
};

export const viewport: Viewport = {
  themeColor: "#10100E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
