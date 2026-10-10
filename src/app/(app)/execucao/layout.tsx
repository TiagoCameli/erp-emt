import type { ReactNode } from "react";

import { TabNavAtivo } from "@/components/canonicos/tab-nav-client";
import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/**
 * Régua de abas da Execução no topo de toda aba. As abas vêm do mesmo
 * `abasVisiveis` do submenu, então quem não vê uma aba não a encontra aqui
 * também. Some sozinha quando só há uma aba visível (Fase 1: Contratos).
 */
export default async function LayoutExecucao({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioLogado();
  const abas = abasVisiveis(usuario, "execucao");

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
