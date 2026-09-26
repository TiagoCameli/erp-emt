import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ProvedorTema } from "@/components/canonicos/provedor-tema";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ERP EMT",
    template: "%s | ERP EMT",
  },
  description: "Sistema de gestão integrada da EMT Construtora",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o next-themes põe a classe do tema no <html>
    // antes da hidratação (script inline, para não piscar claro), e o React
    // estranharia o atributo diferente do HTML do servidor. Vale só para este
    // elemento, não para os filhos.
    <html
      lang="pt-BR"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ProvedorTema>
          {children}
          <Toaster position="top-right" richColors />
        </ProvedorTema>
      </body>
    </html>
  );
}
