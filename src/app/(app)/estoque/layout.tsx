import type { ReactNode } from "react";

import { TabNavAtivo } from "@/components/canonicos/tab-nav-client";
import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/**
 * Régua de abas do Estoque no topo de toda aba, do mesmo `abasVisiveis` do submenu:
 * quem não vê uma aba não a encontra aqui também.
 */
export default async function LayoutEstoque({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioLogado();
  const abas = abasVisiveis(usuario, "estoque");

  return (
    <>
      {abas.length > 1 ? (
        <div className="mb-4">
          <TabNavAtivo recursos={abas} />
        </div>
      ) : null}
      {children}
    </>
  );
}
