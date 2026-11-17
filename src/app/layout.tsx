import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { DataProvider } from "@/components/data-provider";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import "./ui-primitives.css";
import "./studio.css";
import "./theme-dark.css";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// F6: aplica o tema escuro salvo antes da hidratação (só preferência de interface; chave jpn-theme:v1).
const themeScript = `try{if(localStorage.getItem("jpn-theme:v1")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
export const metadata: Metadata = { title: "JPN Projetos | Gestão de estruturas", description: "Cadastro e organização de obras e projetos de estruturas metálicas." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#242622" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={inter.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><TooltipProvider><DataProvider><AppShell>{children}</AppShell></DataProvider></TooltipProvider></body></html>;
}
