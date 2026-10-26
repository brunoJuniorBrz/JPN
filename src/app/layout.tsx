import type { Metadata, Viewport } from "next";
import { DataProvider } from "@/components/data-provider";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
export const metadata: Metadata = { title: "JPN Projetos | Gestão de estruturas", description: "Cadastro e organização de obras e projetos de estruturas metálicas." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#242622" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><DataProvider><AppShell>{children}</AppShell></DataProvider></body></html>;
}
