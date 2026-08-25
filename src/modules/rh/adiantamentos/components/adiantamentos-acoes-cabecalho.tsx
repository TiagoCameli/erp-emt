"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FormaPagamentoOpcao } from "@/modules/financeiro/lancamentos/queries";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { AdiantamentoFormDrawer } from "./adiantamento-form-drawer";

export interface AdiantamentosAcoesCabecalhoProps {
  colaboradores: ColaboradorOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
}

/**
 * Botão "Novo adiantamento" + drawer de criação, para a ação primária do
 * PageHeader. Edições partem do menu de cada linha na tabela.
 */
export function AdiantamentosAcoesCabecalho({
  colaboradores,
  formasPagamento,
}: AdiantamentosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo adiantamento
      </Button>
      <AdiantamentoFormDrawer
        formasPagamento={formasPagamento}
        aberto={aberto}
        onAbertoChange={setAberto}
        colaboradores={colaboradores}
      />
    </>
  );
}
