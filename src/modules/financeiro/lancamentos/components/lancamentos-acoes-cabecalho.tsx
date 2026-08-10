"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importarLancamentos,
  validarImportLancamentos,
} from "@/modules/financeiro/lancamentos/actions";
import { LancamentoFormDrawer } from "./lancamento-form-drawer";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";

export interface LancamentosAcoesCabecalhoProps {
  podeCriar: boolean;
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  centrosCusto: CentroCustoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
}

/**
 * Ações do cabeçalho de lançamentos: importar planilha e criar um novo. Só
 * renderiza quando o usuário tem permissão de criar. Ao criar, navega para o
 * detalhe.
 *
 * A importação aceita lançamento e pagamento na mesma planilha: linha com a
 * coluna "Data de pagamento" preenchida entra já aprovada e paga, o que serve
 * para carregar histórico financeiro fechado.
 */
export function LancamentosAcoesCabecalho({
  podeCriar,
  categorias,
  fornecedores,
  centrosCusto,
  formasPagamento,
  condicoesPagamento,
}: LancamentosAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar lançamentos"
        modeloHref="/financeiro/lancamentos/modelo"
        validarAction={validarImportLancamentos}
        importarAction={importarLancamentos}
      />
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
        centrosCusto={centrosCusto}
        formasPagamento={formasPagamento}
        condicoesPagamento={condicoesPagamento}
        onSalvo={(id) => router.push(`/financeiro/lancamentos/${id}`)}
      />
    </>
  );
}
