"use client";

import * as React from "react";

import { CelulaVazia } from "@/components/canonicos/data-table";

export interface CelulaDescricaoCategoriaProps {
  descricao: string | null;
  /** Nome da categoria financeira do registro. */
  categoriaNome?: string | null;
  /**
   * Detalhe curto da própria descrição, na mesma linha dela (ex. "(origem oc)",
   * "(2ª)"). Não é a categoria: fica ao lado do texto, não embaixo.
   */
  complemento?: React.ReactNode;
}

/**
 * Descrição com a categoria financeira embaixo, em texto menor e cor
 * secundária. É canônico porque a mesma célula aparece em oito listagens
 * (lançamentos, pagamentos, programados, contas a receber, extrato por
 * fornecedor, fila de aprovação, ordens de compra e cotações): cada tela
 * montando o formato na mão já tinha gerado quatro variações diferentes.
 *
 * A segunda linha sai sempre, com "sem categoria" quando falta a classificação.
 * Isso mantém a altura da linha igual em toda a tabela e deixa visível o
 * registro que ninguém classificou, que é justamente o que precisa de atenção.
 *
 * A coluna que usa esta célula precisa de `meta: { naoTruncar: true }`, senão a
 * DataTable envolve tudo num truncate de uma linha e corta a segunda. O
 * truncamento linha a linha é feito aqui dentro.
 */
export function CelulaDescricaoCategoria({
  descricao,
  categoriaNome,
  complemento,
}: CelulaDescricaoCategoriaProps) {
  const texto =
    descricao !== null && descricao.trim() !== "" ? descricao : null;
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={texto ?? undefined}>
        {texto ?? <CelulaVazia />}
        {complemento ? (
          <span className="ml-1.5 font-normal text-legenda text-muted-foreground">
            {complemento}
          </span>
        ) : null}
      </div>
      <div
        className="truncate text-legenda text-muted-foreground"
        title={`Categoria: ${categoriaNome ?? "sem categoria"}`}
      >
        Categoria: {categoriaNome ?? "sem categoria"}
      </div>
    </div>
  );
}
