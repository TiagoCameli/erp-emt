import type { ReactNode } from "react";

import { TabNavAtivo } from "@/components/canonicos/tab-nav-client";
import type { RecursoDef } from "@/config/recursos";

/**
 * Abas da Conciliação (Bloco H, 05/10/2026): a conciliação da conta, o
 * histórico de importações e as regras por histórico. As três ficam sob a
 * mesma permissão (financeiro.conciliacao), que cada página confere.
 */
const ABAS: readonly RecursoDef[] = [
  {
    id: "financeiro.conciliacao",
    nome: "Conciliação",
    modulo: "financeiro",
    rota: "/financeiro/conciliacao",
    acoes: ["ver"],
  },
  {
    id: "financeiro.conciliacao.importacoes",
    nome: "Importações",
    modulo: "financeiro",
    rota: "/financeiro/conciliacao/importacoes",
    acoes: ["ver"],
  },
  {
    id: "financeiro.conciliacao.regras",
    nome: "Regras",
    modulo: "financeiro",
    rota: "/financeiro/conciliacao/regras",
    acoes: ["ver"],
  },
];

export default function LayoutConciliacao({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mb-4">
        <TabNavAtivo recursos={ABAS} />
      </div>
      {children}
    </>
  );
}
