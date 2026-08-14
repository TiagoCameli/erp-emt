"use client";

import * as React from "react";
import { X } from "lucide-react";

import { FiltroSelect, useFiltrosUrl } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 * Seletor de fornecedores do extrato, com MAIS DE UM fornecedor.
 *
 * Desenho: o dropdown acrescenta e os escolhidos viram chips removíveis abaixo.
 * O dropdown é o `FiltroSelect` canônico, que embrulha o Combobox e portanto já
 * tem busca por texto — coisa indispensável aqui, porque são 794 fornecedores com
 * lançamento. Fazer o Combobox virar multi-seleção resolveria também, mas ele é
 * usado em dezenas de formulários do app e não vale o risco de regressão por uma
 * tela: acrescentar e remover em chips dá o mesmo resultado sem tocar nele.
 *
 * Escreve tudo no parâmetro `fornecedor` da URL, separado por vírgula, então o
 * Server Component recarrega e o extrato inteiro (tabela e cartões) acompanha. E
 * é compartilhável: o link leva a mesma seleção.
 */
export function SeletorFornecedor({
  fornecedores,
  valores,
}: SeletorFornecedorProps) {
  const { set } = useFiltrosUrl();

  const nomePorId = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const fornecedor of fornecedores) mapa.set(fornecedor.id, fornecedor.nome);
    return mapa;
  }, [fornecedores]);

  /** Só os que ainda não foram escolhidos aparecem para escolher. */
  const opcoesDisponiveis = React.useMemo(
    () =>
      fornecedores
        .filter((fornecedor) => !valores.includes(fornecedor.id))
        .map((fornecedor) => ({
          valor: fornecedor.id,
          rotulo: fornecedor.nome,
        })),
    [fornecedores, valores],
  );

  function gravar(ids: string[]) {
    set(PARAM_FORNECEDOR, escreverFornecedoresNaUrl(ids));
  }

  function adicionar(id: string) {
    if (id === "" || valores.includes(id)) return;
    if (valores.length >= MAX_FORNECEDORES) {
      // Teto técnico do filtro `in` (ver extrato-filtros.ts). Avisar é melhor que
      // ignorar o clique em silêncio.
      toast.error(
        `O extrato aceita no máximo ${MAX_FORNECEDORES} fornecedores por vez`,
      );
      return;
    }
    gravar([...valores, id]);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Label className="text-detalhe text-muted-foreground">
          {valores.length === 0 ? "Fornecedor" : "Adicionar fornecedor"}
        </Label>
        <FiltroSelect
          // A `key` zera o texto digitado e a escolha do dropdown depois de cada
          // inclusão: ele é um botão de "adicionar", não o estado da seleção.
          key={valores.length}
          valor=""
          onValorChange={adicionar}
          opcoes={opcoesDisponiveis}
          placeholder="Todos os fornecedores"
          todosRotulo="Todos os fornecedores"
          className="max-w-[20rem]"
        />
      </div>

      {valores.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {valores.map((id) => (
            <Badge
              key={id}
              variant="secondary"
              className="max-w-[18rem] gap-1 pr-1"
            >
              <span className="truncate">{nomePorId.get(id) ?? id}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-4 shrink-0"
                aria-label={`Remover ${nomePorId.get(id) ?? "fornecedor"}`}
                onClick={() => gravar(valores.filter((outro) => outro !== id))}
              >
                <X />
              </Button>
            </Badge>
          ))}
          {valores.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-detalhe"
              onClick={() => gravar([])}
            >
              Limpar todos
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
