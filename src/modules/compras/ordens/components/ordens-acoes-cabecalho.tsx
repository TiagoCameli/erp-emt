"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  CentroCustoOpcao,
  CotacaoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
} from "@/modules/compras/ordens/queries";
import { OrdemFormDrawer } from "./ordem-form-drawer";

export interface OrdensAcoesCabecalhoProps {
  podeCriar: boolean;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  cotacoes: CotacaoOpcao[];
  condicoesPagamento: string[];
}

/**
 * Ações do cabeçalho de ordens: criar uma nova OC. Só renderiza quando o
 * usuário tem permissão de criar. Ao criar, navega para o detalhe da OC.
 */
export function OrdensAcoesCabecalho({
  podeCriar,
  fornecedores,
  insumos,
  centrosCusto,
  cotacoes,
  condicoesPagamento,
}: OrdensAcoesCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova ordem
      </Button>

      <OrdemFormDrawer
        key={aberto ? "aberto" : "fechado"}
        aberto={aberto}
        onAbertoChange={setAberto}
        ordem={null}
        fornecedores={fornecedores}
        insumos={insumos}
        centrosCusto={centrosCusto}
        cotacoes={cotacoes}
        condicoesPagamento={condicoesPagamento}
        onCriada={(id) => router.push(`/compras/ordens/${id}`)}
      />
    </>
  );
}
