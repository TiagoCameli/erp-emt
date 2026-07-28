import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/**
 * Portão de acesso ao módulo: sem nenhuma aba visível, a rota não existe para
 * este usuário. A navegação entre as abas fica no submenu da sidebar (mesma
 * fonte, `abasVisiveis`), não numa barra de abas dentro da página.
 */
export default async function ComprasLayout({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioLogado();

  if (abasVisiveis(usuario, "compras").length === 0) notFound();

  return <>{children}</>;
}
