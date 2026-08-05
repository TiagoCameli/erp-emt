"use client";

import * as React from "react";

import {
  CelulaVazia,
  useAlturaLinhaTabela,
} from "@/components/canonicos/data-table";

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
 * Line-height dos tokens de texto da célula, em px: `text-detalhe` (13/20), que a
 * célula da tabela herda e a descrição usa, e `text-legenda` (12/18) da linha da
 * categoria. Ver `--text-detalhe--line-height` e `--text-legenda--line-height` em
 * globals.css — mexer no token lá obriga a mexer aqui.
 *
 * É número em JS, e não conta em CSS, porque o corte multilinha precisa da
 * QUANTIDADE de linhas (`-webkit-line-clamp` só aceita inteiro) antes de o
 * navegador desenhar. Medir na tela seria exato, mas custaria um ResizeObserver
 * por célula, com cem células de descrição numa página de Lançamentos.
 */
const ALTURA_DESCRICAO_POR_LINHA = 20;
const ALTURA_CATEGORIA = 18;

/**
 * Quantas linhas de descrição cabem numa linha de tabela de `altura` px, já
 * descontada a linha da categoria (que é sempre uma).
 *
 * Nunca menos de uma: a linha fina demais para duas linhas de texto (a Compacta,
 * 34px, é o caso) volta a ser uma linha com reticências. Sobra é ignorada de
 * propósito — 3,4 linhas rendem 3, porque a quarta cortada pela metade é
 * exatamente o que a altura fixa não pode mostrar.
 */
export function linhasDaDescricao(altura: number): number {
  return Math.max(
    1,
    Math.floor((altura - ALTURA_CATEGORIA) / ALTURA_DESCRICAO_POR_LINHA),
  );
}

/**
 * Corte multilinha: enche `linhas` linhas e põe reticências na última quando
 * sobrou texto. É `-webkit-line-clamp` porque é o único corte com reticências
 * que existe em várias linhas hoje (o `text-overflow` só sabe cortar uma linha
 * que não quebra) e porque ele corta ENTRE linhas, nunca no meio da letra.
 *
 * Sai em style, e não em classe do Tailwind (`line-clamp-3`), porque o número de
 * linhas é calculado em runtime: a altura da linha pode ser qualquer valor entre
 * 34 e 160 pelo arraste, e classe do Tailwind precisa existir literal no fonte
 * para ser gerada.
 */
function corteMultilinha(linhas: number): React.CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: linhas,
    overflow: "hidden",
  };
}

/**
 * Descrição com a categoria financeira embaixo, em texto menor e cor
 * secundária. É canônico porque a mesma célula aparece em oito listagens
 * (lançamentos, pagamentos, programados, contas a receber, extrato por
 * fornecedor, fila de aprovação, ordens de compra e cotações): cada tela
 * montando o formato na mão já tinha gerado quatro variações diferentes.
 *
 * A descrição sai INTEIRA na altura automática, quebrando em quantas linhas
 * precisar (a linha da tabela cresce para caber), e vira um corte de N linhas com
 * reticências quando o usuário fixa a altura. Era `truncate`, que é
 * `white-space: nowrap`: aumentar a altura da linha só rendia espaço vazio
 * embaixo do texto, porque nowrap não quebra linha por mais alta que a linha
 * esteja.
 *
 * A segunda linha sai sempre, com "sem categoria" quando falta a classificação,
 * para deixar visível o registro que ninguém classificou, que é justamente o que
 * precisa de atenção. Ela continua em uma linha só: é nome de categoria, curto, e
 * é dela que sai a conta de quantas linhas restam para a descrição.
 *
 * A coluna que usa esta célula precisa de `meta: { naoTruncar: true }`, senão a
 * DataTable envolve tudo num truncate de uma linha e corta a segunda. O corte
 * linha a linha é feito aqui dentro.
 */
export function CelulaDescricaoCategoria({
  descricao,
  categoriaNome,
  complemento,
}: CelulaDescricaoCategoriaProps) {
  const texto =
    descricao !== null && descricao.trim() !== "" ? descricao : null;
  const alturaLinha = useAlturaLinhaTabela();
  // Altura automática (o padrão): corte nenhum, o texto sai todo e a linha da
  // tabela cresce. Altura fixa: cabe o que cabe no espaço que a linha tem.
  const corte =
    alturaLinha === null
      ? undefined
      : corteMultilinha(linhasDaDescricao(alturaLinha));
  return (
    <div className="min-w-0">
      <div
        // `whitespace-normal` é obrigatório e é o que faltava: a TableCell do
        // shadcn tem `whitespace-nowrap` fixo, e ele é HERDADO. Tirar o `truncate`
        // sem desfazer o nowrap não fez o texto quebrar, fez ele virar uma linha só
        // SEM corte (o truncate ao menos trazia o overflow:hidden junto), vazando
        // por cima de Valor, Data e Vencimento. Medido na tela: nowrap na td, na
        // wrapper e na descrição, com overflow visible.
        //
        // `break-words` para o texto sem espaço (código de nota, chave de acesso,
        // URL), que quebra linha nenhuma resolve.
        className="font-medium break-words whitespace-normal"
        style={corte}
        // Tooltip só onde pode ter sobrado texto fora da tela. Na altura
        // automática o texto está todo aí, e tooltip repetindo o que se lê é
        // ruído.
        title={corte === undefined ? undefined : (texto ?? undefined)}
      >
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
