"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONFERENCIA } from "@/modules/financeiro/aprovacao-pagamentos/rotulos";
import { FilaAprovacao, type FilaAprovacaoProps } from "./fila-aprovacao";
import {
  PagamentosDiretos,
  type PagamentosDiretosProps,
} from "./pagamentos-diretos";

export interface AprovacaoClienteProps {
  fila: FilaAprovacaoProps;
  diretos: PagamentosDiretosProps;
}

/**
 * As duas metades da tela de aprovação de pagamentos.
 *
 * "Fila de aprovação" é o trabalho que trava dinheiro: nada é pago antes do
 * aval. "Dinheiro e cartão" é o oposto: pagamento que já seguiu sozinho e que o
 * responsável confere depois, sem travar nada. São coisas diferentes o
 * suficiente para não caberem na mesma lista, e parecidas o suficiente para
 * viverem na mesma tela: é a mesma pessoa olhando o mesmo dinheiro.
 *
 * Mesmas abas de Financeiro > Pagamentos (Tabs do shadcn dentro da página); a
 * régua TabNav é a navegação entre abas do módulo, que é outra coisa.
 */
export function AprovacaoCliente({ fila, diretos }: AprovacaoClienteProps) {
  return (
    <Tabs defaultValue="fila">
      <TabsList>
        <TabsTrigger value="fila">Fila de aprovação</TabsTrigger>
        <TabsTrigger value="diretos">{CONFERENCIA.aba}</TabsTrigger>
      </TabsList>

      <TabsContent value="fila">
        <FilaAprovacao {...fila} />
      </TabsContent>

      <TabsContent value="diretos">
        <PagamentosDiretos {...diretos} />
      </TabsContent>
    </Tabs>
  );
}
