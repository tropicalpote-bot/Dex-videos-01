import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DeX Vídeo — Editor em massa",
  description: "Importe vídeos, aplique templates e prepare lotes para redes sociais.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
