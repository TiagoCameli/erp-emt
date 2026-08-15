"use client";

import * as React from "react";

import { Combobox, useFiltrosUrl } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Label } from "@/components/ui/label";
import {
  escreverFornecedoresNaUrl,
  MAX_FORNECEDORES,
  PARAM_FORNECEDOR,
} from "../extrato-filtros";
import type { FornecedorOpcao } from "../queries";

interface SeletorFornecedorProps {
  fornecedores: FornecedorOpcao[];
  /** Ids escolhidos, na ordem em que foram escolhidos. Vazio = todos. */
  valores: string[];
}

/**
 * Seletor de fornecedores do extrato, com marcação múltipla.
 *
 * Usa o `Combobox` canônico no modo múltiplo: caixinha em cada linha, busca por
 * texto (indispensável com 794 fornecedores) e o painel fica aberto enquanto se
 * marca. Os já marcados aparecem no topo da lista quando o painel abre.
 *
 * Escreve no parâmetro `fornecedor` da URL, separado por vírgula, então o Server
 * Component recarrega e o extrato inteiro (tabela e cartões) acompanha. E o link
 * é compartilhável: quem abrir vê a mesma seleção.
 */
export function SeletorFornecedor({
  fornecedores,
  valores,
}: SeletorFornecedorProps) {
  const { set } = useFiltrosUrl();

  const opcoes = React.useMemo(
    () =>
      fornecedores.map((fornecedor) => ({
        valor: fornecedor.id,
        rotulo: fornecedor.nome,
      })),
    [fornecedores],
  );

  function aoMudar(novos: string[]) {
    if (novos.length > MAX_FORNECEDORES) {
      // Teto técnico do filtro `in` (ver extrato-filtros.ts): uuid ocupa 37
      // caracteres na URL do PostgREST. Avisar é melhor que ignorar o clique.
      toast.error(
        `O extrato aceita no máximo ${MAX_FORNECEDORES} fornecedores por vez`,
      );
      return;
    }
    set(PARAM_FORNECEDOR, escreverFornecedoresNaUrl(novos));
  }

  return (
    <div className="flex items-center gap-2">
      <Label className="text-detalhe text-muted-foreground">Fornecedores</Label>
      <Combobox
        valor=""
        onValorChange={() => undefined}
        valores={valores}
        onValoresChange={aoMudar}
        opcoes={opcoes}
        limpavel
        size="sm"
        className="h-8 w-fit min-w-[16rem] max-w-[24rem] gap-1.5 text-detalhe"
        placeholder="Todos os fornecedores"
        buscaPlaceholder="Buscar fornecedor"
        ariaLabel="Fornecedores do extrato"
      />
    </div>
  );
}
