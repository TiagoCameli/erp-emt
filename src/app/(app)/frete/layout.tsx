import type { ReactNode } from "react";

import { TabNavAtivo } from "@/components/canonicos/tab-nav-client";
import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/**
 * Régua de abas do Frete no topo de toda aba, no desktop e no celular. Pedido do
 * Tiago: no Frete se troca de aba o tempo todo (fretes, pagamentos, conta
 * corrente), e o submenu da sidebar, que abre no hover, pede um passo a mais.
 * As abas vêm do mesmo `abasVisiveis` do submenu, então quem não vê uma aba
 * não a encontra aqui também.
 */
export default async function LayoutFrete({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioLogado();
  const abas = abasVisiveis(usuario, "frete");

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
