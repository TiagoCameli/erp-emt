import type { ReactNode } from "react";

import { TabNavAtivo } from "@/components/canonicos/tab-nav-client";
import type { RecursoDef } from "@/config/recursos";

/**
 * Abas de Fornecedores: o cadastro e os apelidos bancários (Bloco I da
 * conciliação). As duas ficam sob a permissão de Fornecedores.
 */
const ABAS: readonly RecursoDef[] = [
  {
    id: "cadastros.fornecedores",
    nome: "Fornecedores",
    modulo: "cadastros",
    rota: "/cadastros/fornecedores",
    acoes: ["ver"],
  },
  {
    id: "cadastros.fornecedores.apelidos",
    nome: "Apelidos bancários",
    modulo: "cadastros",
    rota: "/cadastros/fornecedores/apelidos",
    acoes: ["ver"],
  },
];

export default function LayoutFornecedores({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mb-4">
        <TabNavAtivo recursos={ABAS} />
      </div>
      {children}
    </>
  );
}
