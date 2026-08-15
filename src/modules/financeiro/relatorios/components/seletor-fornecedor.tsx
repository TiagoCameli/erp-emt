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

  /**
   * Escolha local, à frente da URL.
   *
   * SEM isto não dá para marcar dois seguidos, e foi o defeito que o Tiago pegou:
   * gravar na URL é assíncrono (router.replace, ida ao servidor), então o segundo
   * clique ainda enxergava a lista ANTIGA vindo do servidor e gravava só ele,
   * substituindo o primeiro. Marcar devagar funcionava; marcar rápido, não.
   *
   * O estado local responde na hora e a URL vai atrás. Quando a volta do servidor
   * chega diferente do que temos (link colado, voltar do navegador, outra aba), o
   * local se rende a ela — comparando pelo CONTEÚDO, porque o array vem novo a
   * cada render e comparar referência ressincronizaria sempre, matando o efeito.
   */
  const chaveDoServidor = valores.join(",");
  const [escolhidos, setEscolhidos] = React.useState(valores);
  // Guarda o que o servidor mandou por último em ESTADO, não em ref: é o padrão
  // da doc do React para "ajustar estado quando a prop muda", e o lint do projeto
  // (com razão) barra tocar em ref durante o render. Efeito também não serve:
  // renderizaria a lista velha por um quadro.
  const [chaveAnterior, setChaveAnterior] = React.useState(chaveDoServidor);
  if (chaveAnterior !== chaveDoServidor) {
    setChaveAnterior(chaveDoServidor);
    setEscolhidos(valores);
  }

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
    // Local primeiro (a caixinha marca na hora), URL depois.
    //
    // `chaveAnterior` NÃO é tocada aqui de propósito: ela rastreia o que o
    // SERVIDOR mandou por último. Atualizá-la no clique fazia a sincronização de
    // render achar que a volta já tinha chegado e desfazer a marcação otimista na
    // hora — o teste pegou isso, e era o mesmo sintoma do defeito original.
    setEscolhidos(novos);
    set(PARAM_FORNECEDOR, escreverFornecedoresNaUrl(novos));
  }

  return (
    <div className="flex items-center gap-2">
      <Label className="text-detalhe text-muted-foreground">Fornecedores</Label>
      <Combobox
        valor=""
        onValorChange={() => undefined}
        valores={escolhidos}
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
