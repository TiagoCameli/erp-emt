"use client";

import type { CSSProperties, ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Alinhamento do conteúdo de uma coluna. */
export type AlinhamentoColuna = "left" | "center" | "right";

/** Uma coluna da tabela de itens. `largura` é um trilho de grid CSS. */
export interface ColunaItem {
  chave: string;
  rotulo: string;
  /** Trilho de grid no desktop, ex.: "1fr", "120px", "140px". */
  largura: string;
  /**
   * Padrão "center", igual às listagens do app: item de formulário e item de
   * listagem ficam alinhados na mesma tela. "right" é a exceção de dinheiro,
   * quantidade, total e percentual. "left" é para a célula que é um campo de
   * largura cheia com o texto na esquerda (data, Combobox): centralizar dentro
   * do campo está descartado, então quem vai para a esquerda é o rótulo, para
   * ele ficar em cima do texto e não de um vão vazio.
   */
  alinhamento?: AlinhamentoColuna;
  obrigatorio?: boolean;
}

/** Alinhamento do rótulo no cabeçalho (que só existe no desktop). */
const CLASSE_CABECALHO: Record<AlinhamentoColuna, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * Alinhamento do conteúdo da célula no desktop. Centralizar e alinhar à
 * esquerda mexem no BLOCO (`items-*`), não no `text-align`: `text-align` é
 * herdado, e centralizar a célula centralizaria também o texto dentro de um
 * `Input`, jogando o cursor de quem digita para o meio do campo. À direita
 * mantém o `text-align` porque é o que os campos numéricos já fazem
 * (`InputMoeda` e `InputQuantidade` nascem `text-right`) e porque valor que
 * quebra em duas linhas continua alinhado pela direita.
 */
const CLASSE_CELULA: Record<AlinhamentoColuna, string> = {
  left: "sm:items-start",
  center: "sm:items-center",
  right: "sm:items-end sm:text-right",
};

/**
 * Trilho da lixeira. Fixo na largura do botão (`icon-sm` é `size-8`) em vez de
 * `auto` porque o cabeçalho põe um vão vazio nesse trilho: com `auto` ele
 * mediria 0 no cabeçalho e 32px na linha, e cada rótulo terminava deslocado da
 * sua coluna.
 */
const TRILHO_REMOVER = "2rem";

export interface TabelaItensProps<L> {
  colunas: ColunaItem[];
  linhas: L[];
  chaveLinha: (linha: L, indice: number) => string;
  renderCelula: (chave: string, indice: number) => ReactNode;
  erroCelula?: (chave: string, indice: number) => string | undefined;
  onRemover: (indice: number) => void;
  podeRemover?: (indice: number) => boolean;
  rotuloRemover?: string;
  rodape?: ReactNode;
  className?: string;
}

/**
 * Tabela compacta de itens que repetem (ex.: insumos de uma OC). O rótulo de
 * cada coluna aparece 1x como cabeçalho no desktop; no celular cada linha vira
 * um card empilhado com rótulo por campo. Genérica: não conhece react-hook-form,
 * recebe as linhas e um renderCelula. Cálculo (subtotal/total) fica fora dela.
 */
export function TabelaItens<L>({
  colunas,
  linhas,
  chaveLinha,
  renderCelula,
  erroCelula,
  onRemover,
  podeRemover,
  rotuloRemover = "Remover",
  rodape,
  className,
}: TabelaItensProps<L>) {
  // trilhos das colunas + trilho da lixeira
  const template = `${colunas.map((c) => c.largura).join(" ")} ${TRILHO_REMOVER}`;
  const estiloGrid = { "--cols-itens": template } as CSSProperties;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Cabeçalho: só no desktop, 1x */}
      <div
        data-testid="tabela-itens-header"
        style={estiloGrid}
        className="hidden gap-3 px-3 sm:grid sm:grid-cols-[var(--cols-itens)]"
      >
        {colunas.map((coluna) => (
          <span
            key={coluna.chave}
            className={cn(
              "text-legenda font-medium text-muted-foreground",
              CLASSE_CABECALHO[coluna.alinhamento ?? "center"],
            )}
          >
            {coluna.rotulo}
            {coluna.obrigatorio ? (
              <span className="text-destructive" aria-hidden>
                {" "}*
              </span>
            ) : null}
          </span>
        ))}
        <span aria-hidden />
      </div>

      {linhas.map((linha, indice) => {
        const removivel = podeRemover ? podeRemover(indice) : true;
        return (
          <div
            key={chaveLinha(linha, indice)}
            data-testid="tabela-itens-linha"
            style={estiloGrid}
            className="grid grid-cols-1 gap-2 rounded-md bg-card px-3 py-2 sm:grid-cols-[var(--cols-itens)] sm:items-start sm:gap-3"
          >
            {colunas.map((coluna) => {
              const erro = erroCelula?.(coluna.chave, indice);
              return (
                <div key={coluna.chave} className="flex flex-col gap-1">
                  {/* rótulo só no mobile (no desktop está no cabeçalho) */}
                  <Label className="text-legenda text-muted-foreground sm:hidden">
                    {coluna.rotulo}
                  </Label>
                  <div
                    data-testid="tabela-itens-celula"
                    className={cn(
                      "flex flex-col",
                      CLASSE_CELULA[coluna.alinhamento ?? "center"],
                    )}
                  >
                    {renderCelula(coluna.chave, indice)}
                  </div>
                  {erro ? (
                    <p className="text-legenda text-destructive" role="alert">
                      {erro}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="justify-self-end"
              aria-label={rotuloRemover}
              disabled={!removivel}
              onClick={() => onRemover(indice)}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}

      {rodape ? <div>{rodape}</div> : null}
    </div>
  );
}
