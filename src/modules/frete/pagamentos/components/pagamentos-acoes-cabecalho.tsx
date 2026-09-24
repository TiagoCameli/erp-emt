"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { importarPagamentos, validarImportPagamentos } from "@/modules/frete/pagamentos/actions";
import type { OpcaoPagoPor, Transportadora } from "@/modules/frete/pagamentos/queries";
import { ImportarPlanilhaFrete } from "./importar-planilha-frete";
import { PagamentoFormDrawer } from "./pagamento-form-drawer";

export interface PagamentosAcoesCabecalhoProps {
  podeCriar: boolean;
  /** Transportadoras ativas. */
  transportadoras: Transportadora[];
  opcoesPagoPor: OpcaoPagoPor[];
  nomeUsuario: string;
  mesHoje: string;
}

/** "Importar planilha" e "Novo pagamento" do cabeçalho (só com `frete.pagamentos/criar`). */
export function PagamentosAcoesCabecalho({
  podeCriar,
  transportadoras,
  opcoesPagoPor,
  nomeUsuario,
  mesHoje,
}: PagamentosAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);
  if (!podeCriar) return null;
  return (
    <>
      <ImportarPlanilhaFrete
        titulo="Importar pagamentos de frete"
        modeloHref="/frete/pagamentos/modelo"
        validarAction={validarImportPagamentos}
        importarAction={importarPagamentos}
        mensagemSucesso={(n) => `${n} ${n === 1 ? "pagamento importado" : "pagamentos importados"} com sucesso`}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo pagamento
      </Button>
      <PagamentoFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        pagamento={null}
        transportadoras={transportadoras}
        opcoesPagoPor={opcoesPagoPor}
        nomeUsuario={nomeUsuario}
        mesHoje={mesHoje}
      />
    </>
  );
}
