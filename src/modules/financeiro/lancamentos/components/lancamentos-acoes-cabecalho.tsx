"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BotaoExportarLancamentos } from "./botao-exportar-lancamentos";
import { LancamentoFormDrawer } from "./lancamento-form-drawer";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  ClienteOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";

export interface LancamentosAcoesCabecalhoProps {
  podeCriar: boolean;
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  clientes: ClienteOpcao[];
  contas: ContaBancariaOpcao[];
  centrosCusto: CentroCustoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
}

/**
 * Ações do cabeçalho de lançamentos: exportar para Excel e criar um novo.
 *
 * "Novo lançamento" depende da permissão de criar; exportar NÃO, porque exportar
 * é ler e quem abre a tela já pode ler. Por isso o `podeCriar` esconde só o botão
 * de criar, e não o cabeçalho inteiro como antes: com o `return null` no topo,
 * quem só consulta ficava sem o botão de exportar sem motivo.
 *
 * O primário fica por último, na ponta direita, que é onde ele está em todas as
 * telas. Ao criar, navega para o detalhe.
 */
export function LancamentosAcoesCabecalho({
  podeCriar,
  categorias,
  fornecedores,
  clientes,
  contas,
  centrosCusto,
  formasPagamento,
  condicoesPagamento,
}: LancamentosAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <>
      <BotaoExportarLancamentos />

      {/* O formulário anda junto com o botão que o abre: sem permissão de criar,
          nada de drawer montado na página. */}
      {podeCriar ? (
        <>
          <Button type="button" size="sm" onClick={() => setAberto(true)}>
            <Plus />
            Novo lançamento
          </Button>

          <LancamentoFormDrawer
            key={aberto ? "aberto" : "fechado"}
            aberto={aberto}
            onAbertoChange={setAberto}
            lancamento={null}
            categorias={categorias}
            fornecedores={fornecedores}
            clientes={clientes}
            contas={contas}
            centrosCusto={centrosCusto}
            formasPagamento={formasPagamento}
            condicoesPagamento={condicoesPagamento}
            onSalvo={(id) => router.push(`/financeiro/lancamentos/${id}`)}
          />
        </>
      ) : null}
    </>
  );
}
