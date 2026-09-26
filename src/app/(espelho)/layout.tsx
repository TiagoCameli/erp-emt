import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Espelho",
};

/**
 * Layout do espelho: sem AppShell de propósito. Sidebar, submenu e filtro não
 * vão para o papel, e o grupo `(auth)` já é o precedente de rota sem shell
 * neste projeto.
 *
 * `tema-claro` porque o espelho vai pra contador e processo: sai claro na tela e
 * no papel mesmo com o tema escuro ligado.
 */
export default function EspelhoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="espelho-raiz tema-claro min-h-screen">{children}</div>;
}
