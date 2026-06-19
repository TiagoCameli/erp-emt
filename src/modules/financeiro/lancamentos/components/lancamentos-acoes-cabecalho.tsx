"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LancamentoFormDrawer } from "./lancamento-form-drawer";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";

export interface LancamentosAcoesCabecalhoProps {
  podeCriar: boolean;
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  centrosCusto: CentroCustoOpcao[];
}

/**
 * Ação do cabeçalho de lançamentos: criar um novo. Só renderiza quando o
 * usuário tem permissão de criar. Ao criar, navega para o detalhe.
 */
export function LancamentosAcoesCabecalho({
  podeCriar,
  categorias,
  fornecedores,
  centrosCusto,
}: LancamentosAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
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
        centrosCusto={centrosCusto}
        onSalvo={(id) => router.push(`/financeiro/lancamentos/${id}`)}
      />
    </>
  );
}
