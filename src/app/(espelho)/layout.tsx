import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Espelho",
};

/**
 * Layout do espelho: sem AppShell de propósito. Sidebar, submenu e filtro não
 * vão para o papel, e o grupo `(auth)` já é o precedente de rota sem shell
 * neste projeto.
 */
export default function EspelhoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="espelho-raiz min-h-screen">{children}</div>;
}
