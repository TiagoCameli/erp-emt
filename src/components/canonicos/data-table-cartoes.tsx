"use client";

import * as React from "react";
import { flexRender, type Column, type Row } from "@tanstack/react-table";
import { ChevronDown } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Quantos campos o card mostra além do título e do valor antes de pedir um
 * toque: o primeiro como subtítulo, sem rótulo, e quatro em duas colunas. Cabe
 * em três linhas, o que dá para ler de relance andando na obra. O resto fica em
 * "Mais N campos".
 */
const CAMPOS_NA_GRADE = 4;

const QTD_SKELETON = 3;

/** O papel de cada coluna no card, decidido uma vez para a lista inteira. */
export interface PapeisCartao<TData> {
  titulo: Column<TData, unknown> | undefined;
  valor: Column<TData, unknown> | undefined;
  /** Linha sem rótulo embaixo do título: quase sempre quem (fornecedor...). */
  subtitulo: Column<TData, unknown> | undefined;
  /** O resto, na ordem do card, com rótulo. */
  campos: Column<TData, unknown>[];
  /** Checkbox da linha, no canto esquerdo do card. */
  selecao: Column<TData, unknown> | undefined;
  /** Botões ou menu da linha, no canto direito, fora do clique do card. */
  acoes: Column<TData, unknown> | undefined;
}

/**
 * As colunas que não são dado: a do canônico (`__acoes__`, `__selecao__`,
 * `__expansao__`) e as que as telas montam à mão com os mesmos papéis. Trinta e
 * poucas telas têm a própria coluna `acoes` (todos os cadastros, quase todo o
 * RH), e sem reconhecer isso o "⋮" virava o valor do card ou um campo rotulado.
 */
export interface ColunasEspeciais {
  selecao: readonly string[];
  acoes: readonly string[];
  /** Não entram no card (o chevron de expandir: o card tem o próprio). */
  ocultas: readonly string[];
}

const ROTULO_ACOES = "Ações";

/**
 * Distribui as colunas visíveis nos lugares do card.
 *
 * Sem `meta.celular` nenhuma, a regra é a que serve para quase toda listagem do
 * app: o título é a primeira coluna de texto (número do documento, nome) e o
 * valor é a primeira alinhada à direita (dinheiro, quantidade). A tela que
 * precisa de outra coisa marca `celular: "titulo" | "valor"`; `"destaque"` sobe
 * a coluna para os primeiros campos e `"oculta"` tira do card.
 *
 * Coluna com `esconderAte` foi marcada pela tela como a primeira a sair em tela
 * estreita: no card ela vai para o fim da fila de campos, não some.
 */
export function papeisDoCartao<TData>(
  colunas: Column<TData, unknown>[],
  especiais: ColunasEspeciais,
): PapeisCartao<TData> {
  const meta = (coluna: Column<TData, unknown>) => coluna.columnDef.meta;
  const selecao = colunas.find((coluna) =>
    especiais.selecao.includes(coluna.id),
  );
  const acoes = colunas.find(
    (coluna) =>
      especiais.acoes.includes(coluna.id) ||
      meta(coluna)?.rotulo === ROTULO_ACOES,
  );
  const dados = colunas.filter(
    (coluna) =>
      coluna !== selecao &&
      coluna !== acoes &&
      !especiais.ocultas.includes(coluna.id) &&
      meta(coluna)?.celular !== "oculta",
  );

  const titulo =
    dados.find((coluna) => meta(coluna)?.celular === "titulo") ??
    dados.find(
      (coluna) =>
        meta(coluna)?.alinharDireita !== true &&
        meta(coluna)?.celular !== "valor",
    );
  const valor =
    dados.find((coluna) => meta(coluna)?.celular === "valor") ??
    dados.find(
      (coluna) =>
        coluna !== titulo &&
        meta(coluna)?.alinharDireita === true &&
        meta(coluna)?.celular === undefined,
    );

  const sobra = dados.filter((coluna) => coluna !== titulo && coluna !== valor);
  // O subtítulo é a primeira coluna comum na ordem da tabela. Destaque não
  // entra: destaque é algo que precisa do rótulo (um prazo, um saldo) e sem ele
  // seria só um número solto.
  const subtitulo = sobra.find(
    (coluna) =>
      meta(coluna)?.celular === undefined &&
      meta(coluna)?.esconderAte === undefined,
  );
  const resto = sobra.filter((coluna) => coluna !== subtitulo);
  const peso = (coluna: Column<TData, unknown>) =>
    meta(coluna)?.celular === "destaque"
      ? 0
      : meta(coluna)?.esconderAte
        ? 2
        : 1;
  // `sort` é estável: dentro do mesmo peso, a ordem é a das colunas.
  const campos = [...resto].sort((a, b) => peso(a) - peso(b));

  return { titulo, valor, subtitulo, campos, selecao, acoes };
}

export interface DataTableCartoesProps<TData> {
  linhas: Row<TData>[];
  papeis: PapeisCartao<TData>;
  rotuloDe: (coluna: Column<TData, unknown>) => string;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  onRowClick?: (registro: TData) => void;
  linhaExpandida?: (registro: TData) => React.ReactNode;
  /** Totais por id de coluna, o mesmo `rodape` da tabela. */
  rodape?: Record<string, React.ReactNode>;
  colunas: Column<TData, unknown>[];
  /** O checkbox de "todos desta página", que na tabela mora no cabeçalho. */
  selecaoTodos?: React.ReactNode;
}

/** Para clique em controle de dentro do card não abrir o detalhe junto. */
function pararClique(evento: React.SyntheticEvent) {
  evento.stopPropagation();
}

function Celula<TData>({
  linha,
  coluna,
}: {
  linha: Row<TData>;
  coluna: Column<TData, unknown> | undefined;
}) {
  if (!coluna) return null;
  const celula = linha
    .getVisibleCells()
    .find((candidata) => candidata.column.id === coluna.id);
  if (!celula) return null;
  return <>{flexRender(celula.column.columnDef.cell, celula.getContext())}</>;
}

function Cartao<TData>({
  linha,
  papeis,
  rotuloDe,
  onRowClick,
  linhaExpandida,
}: Omit<
  DataTableCartoesProps<TData>,
  "linhas" | "isLoading" | "emptyState" | "rodape" | "colunas" | "selecaoTodos"
> & { linha: Row<TData> }) {
  const [todos, setTodos] = React.useState(false);
  const colunaSelecao = papeis.selecao;
  const colunaAcoes = papeis.acoes;
  const temSelecao = colunaSelecao !== undefined;
  const temAcoes = colunaAcoes !== undefined;

  const subtitulo = papeis.subtitulo;
  const grade = todos ? papeis.campos : papeis.campos.slice(0, CAMPOS_NA_GRADE);
  const escondidos = papeis.campos.length - CAMPOS_NA_GRADE;
  const aberta = linhaExpandida !== undefined && linha.getIsExpanded();

  return (
    <li
      data-cartao={linha.id}
      onClick={onRowClick ? () => onRowClick(linha.original) : undefined}
      onKeyDown={
        onRowClick
          ? (evento) => {
              if (evento.target !== evento.currentTarget) return;
              if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                onRowClick(linha.original);
              }
            }
          : undefined
      }
      tabIndex={onRowClick ? 0 : undefined}
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-detalhe",
        onRowClick && "cursor-pointer foco-anel active:bg-muted/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        {temSelecao ? (
          <div className="pt-0.5" onClick={pararClique}>
            <Celula linha={linha} coluna={colunaSelecao} />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {papeis.titulo || papeis.valor ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-semibold break-words [&_*]:text-left">
                <Celula linha={linha} coluna={papeis.titulo} />
              </div>
              {papeis.valor ? (
                <div className="shrink-0 text-right font-semibold whitespace-nowrap tabular-nums">
                  <Celula linha={linha} coluna={papeis.valor} />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* O primeiro campo é o subtítulo: quase sempre quem (fornecedor,
              colaborador, equipamento), que se lê sem rótulo. */}
          {subtitulo ? (
            <div className="min-w-0 break-words text-foreground [&_*]:justify-start [&_*]:text-left">
              <Celula linha={linha} coluna={subtitulo} />
            </div>
          ) : null}

          {grade.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {grade.map((coluna) => (
                <div key={coluna.id} className="flex min-w-0 flex-col">
                  <dt className="truncate text-legenda text-muted-foreground">
                    {rotuloDe(coluna)}
                  </dt>
                  {/* Célula montada para a tabela vem centralizada e às vezes
                      em flex com `justify-center`: no card tudo encosta à
                      esquerda. */}
                  <dd className="min-w-0 break-words text-foreground [&_*]:justify-start [&_*]:text-left">
                    <Celula linha={linha} coluna={coluna} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {escondidos > 0 ? (
            <button
              type="button"
              onClick={(evento) => {
                evento.stopPropagation();
                setTodos((atual) => !atual);
              }}
              aria-expanded={todos}
              className="self-start text-legenda text-primary underline-offset-2 hover:underline"
            >
              {todos
                ? "Menos campos"
                : `Mais ${escondidos} ${escondidos === 1 ? "campo" : "campos"}`}
            </button>
          ) : null}
        </div>

        {temAcoes ? (
          <div className="-mt-1 -mr-1 shrink-0" onClick={pararClique}>
            <Celula linha={linha} coluna={colunaAcoes} />
          </div>
        ) : null}
      </div>

      {linhaExpandida ? (
        <>
          <button
            type="button"
            onClick={(evento) => {
              evento.stopPropagation();
              linha.toggleExpanded();
            }}
            aria-expanded={aberta}
            className="flex items-center gap-1 self-start text-legenda text-primary"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                aberta && "rotate-180",
              )}
              aria-hidden="true"
            />
            {aberta ? "Esconder detalhes" : "Ver detalhes"}
          </button>
          {aberta ? (
            <div
              className="-mx-3 -mb-3 border-t border-border bg-background"
              onClick={pararClique}
            >
              {linhaExpandida(linha.original)}
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

/**
 * A listagem no celular: um card por registro, no lugar da tabela.
 *
 * Nasceu da fila de aprovação de pagamentos, que no celular virava rolagem para
 * o lado procurando o botão. Aqui vale para toda DataTable do app: as mesmas
 * colunas, as mesmas células (o que a tela já monta com badge, link e
 * MoneyText), o mesmo clique no registro e o mesmo menu de ações, só que
 * empilhados num card que se lê de cima para baixo.
 *
 * O que a pessoa escondeu no menu "Colunas" do computador também não aparece
 * aqui: o card lê as colunas visíveis, então a escolha dela vale nos dois.
 */
export function DataTableCartoes<TData>({
  linhas,
  papeis,
  rotuloDe,
  isLoading,
  emptyState,
  onRowClick,
  linhaExpandida,
  rodape,
  colunas,
  selecaoTodos,
}: DataTableCartoesProps<TData>) {
  if (isLoading) {
    return (
      <ul className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: QTD_SKELETON }, (_, indice) => (
          <li
            key={indice}
            className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
          >
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
          </li>
        ))}
      </ul>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-md border border-border px-3 py-6 text-center text-detalhe text-muted-foreground">
        {emptyState ?? "Nenhum registro encontrado"}
      </div>
    );
  }

  // O rodapé da coluna do título é rótulo ("Total do contrato"), não número:
  // vira o cabeçalho do bloco em vez de uma linha que parece valor.
  const rotuloTotais =
    papeis.titulo && rodape ? rodape[papeis.titulo.id] : undefined;
  const totais = rodape
    ? colunas.filter(
        (coluna) =>
          coluna !== papeis.titulo &&
          rodape[coluna.id] !== undefined &&
          rodape[coluna.id] !== null,
      )
    : [];

  return (
    <div className="flex flex-col gap-2">
      {selecaoTodos ? (
        <label className="flex items-center gap-2.5 px-3 text-legenda text-muted-foreground">
          {selecaoTodos}
          Selecionar todos desta página
        </label>
      ) : null}
      <ul className="flex flex-col gap-2" aria-label="Registros">
        {linhas.map((linha) => (
          <Cartao
            key={linha.id}
            linha={linha}
            papeis={papeis}
            rotuloDe={rotuloDe}
            onRowClick={onRowClick}
            linhaExpandida={linhaExpandida}
          />
        ))}
      </ul>
      {totais.length > 0 ? (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md border border-border bg-surface p-3 text-detalhe">
          {rotuloTotais !== undefined && rotuloTotais !== null ? (
            <p className="col-span-2 font-semibold">{rotuloTotais}</p>
          ) : null}
          {totais.map((coluna) => (
            <React.Fragment key={coluna.id}>
              <dt className="text-muted-foreground">{rotuloDe(coluna)}</dt>
              <dd className="text-right font-semibold tabular-nums">
                {rodape?.[coluna.id]}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
