"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CelulaVazia,
  Combobox,
  DataTable,
  EmptyState,
  InputPreco,
  InputQuantidade,
  MoneyText,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { rotuloInsumo } from "@/modules/_shared/insumo/rotulo";
import { salvarPrecos } from "@/modules/compras/cotacoes/actions";
import {
  montarComparativo,
  paraNumero,
} from "@/modules/compras/cotacoes/calculo";
import type {
  CotacaoDetalhe,
  InsumoOpcao,
} from "@/modules/compras/cotacoes/queries";

/**
 * Fundo do menor preço da linha e do menor total. No pé, que fica preso por
 * cima da matriz quando ela rola, o verde vai como camada de imagem sobre o
 * `bg-surface` do pé: como cor de fundo ele substituiria o surface, e o verde a
 * 10% deixaria ver as linhas passando por baixo.
 */
const CLASSE_MENOR = "bg-status-aprovado/10";
const CLASSE_MENOR_RODAPE =
  "bg-linear-to-b from-status-aprovado/10 to-status-aprovado/10";

/** Estado editável de uma linha do mapa (um insumo). */
interface LinhaEditavel {
  insumoId: string;
  insumoNome: string;
  insumoCodigo: string | null;
  unidadeSigla: string | null;
  quantidade: string;
  /** Preço unitário por cotacao_fornecedor_id, como string do input. */
  precos: Record<string, string>;
}

/** Linha como a tabela recebe: a editável mais o menor preço dela. */
interface LinhaMapa extends LinhaEditavel {
  /** Menor preço lançado na linha (undefined sem preço nenhum). */
  menor: number | undefined;
}

/** O preço deste fornecedor é o menor da linha? Pinta a célula de verde. */
function ehMenorDaLinha(linha: LinhaMapa, fornecedorId: string): boolean {
  const preco = paraNumero(linha.precos[fornecedorId] ?? "");
  return preco > 0 && linha.menor !== undefined && preco === linha.menor;
}

/**
 * Assinatura do detalhe que deve refazer as linhas editáveis: muda quando o
 * servidor manda novos fornecedores, insumos ou preços (após salvar/revalidar).
 */
function sinalDoDetalhe(cotacao: CotacaoDetalhe): string {
  const fornecedores = cotacao.fornecedores.map((f) => f.id).join(",");
  const insumos = cotacao.insumos
    .map((i) => `${i.insumoId}:${i.quantidade}`)
    .join(",");
  const precos = Object.entries(cotacao.precos)
    .map(([insumoId, linha]) =>
      Object.entries(linha)
        .map(([fid, celula]) => `${insumoId}:${fid}:${celula.precoUnitario}`)
        .join(","),
    )
    .join("|");
  return `${cotacao.id}#${fornecedores}#${insumos}#${precos}`;
}

/** Monta as linhas editáveis a partir do detalhe vindo do servidor. */
function linhasIniciais(cotacao: CotacaoDetalhe): LinhaEditavel[] {
  return cotacao.insumos.map((insumo) => {
    const precos: Record<string, string> = {};
    const linhaPrecos = cotacao.precos[insumo.insumoId] ?? {};
    for (const fornecedor of cotacao.fornecedores) {
      const celula = linhaPrecos[fornecedor.id];
      precos[fornecedor.id] = celula
        ? String(celula.precoUnitario).replace(".", ",")
        : "";
    }
    return {
      insumoId: insumo.insumoId,
      insumoNome: insumo.insumoNome,
      insumoCodigo: insumo.insumoCodigo,
      unidadeSigla: insumo.unidadeSigla,
      quantidade: String(insumo.quantidade).replace(".", ","),
      precos,
    };
  });
}

export interface MapaComparativoProps {
  cotacao: CotacaoDetalhe;
  insumos: InsumoOpcao[];
  podeEditar: boolean;
}

/**
 * Mapa comparativo da cotação: linhas = insumos, colunas = fornecedores.
 * Em cotação aberta com permissão, edita quantidades e preços e salva o lote
 * inteiro. Em cotação finalizada/cancelada (ou sem permissão), só leitura.
 * Menor preço por linha em verde; menor total por coluna em verde.
 */
export function MapaComparativo({
  cotacao,
  insumos,
  podeEditar,
}: MapaComparativoProps) {
  const editavel = podeEditar && cotacao.status === "aberta";

  const [linhas, setLinhas] = React.useState<LinhaEditavel[]>(() =>
    linhasIniciais(cotacao),
  );
  const [insumoNovo, setInsumoNovo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Resincroniza durante a renderização quando o servidor manda dados novos
  // (após salvar/adicionar fornecedor). Padrão de "ajustar estado ao mudar uma
  // prop", recomendado pelo React, sem efeito que dispara renders em cascata.
  const sinal = sinalDoDetalhe(cotacao);
  const [sinalAnterior, setSinalAnterior] = React.useState(sinal);
  if (sinal !== sinalAnterior) {
    setSinalAnterior(sinal);
    setLinhas(linhasIniciais(cotacao));
  }

  const fornecedores = cotacao.fornecedores;

  const insumosDisponiveis = React.useMemo(() => {
    const usados = new Set(linhas.map((linha) => linha.insumoId));
    return insumos.filter((insumo) => !usados.has(insumo.id));
  }, [insumos, linhas]);

  // Totais por fornecedor e menor preço por linha, recalculados ao vivo.
  const calc = React.useMemo(
    () =>
      montarComparativo(
        linhas.map((linha) => ({
          insumoId: linha.insumoId,
          quantidade: paraNumero(linha.quantidade),
          precos: Object.fromEntries(
            fornecedores.map((fornecedor) => [
              fornecedor.id,
              paraNumero(linha.precos[fornecedor.id] ?? ""),
            ]),
          ),
        })),
        fornecedores.map((fornecedor) => fornecedor.id),
      ),
    [linhas, fornecedores],
  );

  const dados = React.useMemo<LinhaMapa[]>(
    () =>
      linhas.map((linha) => ({
        ...linha,
        menor: calc.menorPorLinha.get(linha.insumoId),
      })),
    [linhas, calc],
  );

  // Quem tem o menor total (pode empatar), como chave de texto: o verde do pé
  // só é refeito quando o sugerido muda, e não a cada tecla digitada.
  const menoresTotais = fornecedores
    .filter((fornecedor) => {
      const total = calc.totalPorFornecedor.get(fornecedor.id) ?? 0;
      return total > 0 && total === calc.menorTotal;
    })
    .map((fornecedor) => fornecedor.id)
    .join(",");

  /*
    Linhas = insumos, colunas = fornecedores. Cada fornecedor é uma coluna com o
    id da cotacao_fornecedor, para a largura e a ordem que o usuário escolher
    ficarem presas ao fornecedor certo. Nenhuma coluna ordena: o mapa é de
    edição, e ordenar por preço faria a linha pular de lugar no meio da
    digitação.

    As colunas NÃO podem ser refeitas enquanto a pessoa digita: o TanStack
    trata a função `cell` como componente, e uma função nova é um componente
    novo, que desmonta o campo e tira o foco no meio do número. Por isso os
    campos leem o valor da própria linha (`row.original`), estas colunas só
    dependem dos fornecedores e do modo de edição, e o verde do menor total
    entra por cima, abaixo, sem trocar a `cell`.
  */
  const colunasBase = React.useMemo<ColumnDef<LinhaMapa, unknown>[]>(() => {
    function alterarPreco(insumoId: string, fornecedorId: string, valor: string) {
      setLinhas((atual) =>
        atual.map((linha) =>
          linha.insumoId === insumoId
            ? { ...linha, precos: { ...linha.precos, [fornecedorId]: valor } }
            : linha,
        ),
      );
    }

    return [
      {
        id: "insumo",
        header: "Insumo",
        size: 260,
        enableSorting: false,
        meta: { fixa: true, naoTruncar: true, celular: "titulo" },
        cell: ({ row }) => (
          <>
            <span className="font-medium">{row.original.insumoNome}</span>
            {row.original.insumoCodigo ? (
              <span className="ml-2 codigo-doc text-muted-foreground">
                {row.original.insumoCodigo}
              </span>
            ) : null}
          </>
        ),
      },
      {
        id: "quantidade",
        header: "Quantidade",
        size: editavel ? 160 : 130,
        enableSorting: false,
        // O campo monta o próprio layout; o corte de uma linha cortaria o anel de foco.
        meta: { alinharDireita: true, naoTruncar: true },
        cell: ({ row }) => {
          const linha = row.original;
          return editavel ? (
            <div className="flex items-center justify-end gap-1">
              <InputQuantidade
                valor={linha.quantidade}
                onValorChange={(valor) =>
                  setLinhas((atual) =>
                    atual.map((outra) =>
                      outra.insumoId === linha.insumoId
                        ? { ...outra, quantidade: valor }
                        : outra,
                    ),
                  )
                }
                className="h-8 w-24"
                placeholder="0"
                ariaLabel={`Quantidade de ${linha.insumoNome}`}
              />
              {linha.unidadeSigla ? (
                <span className="text-legenda text-muted-foreground">
                  {linha.unidadeSigla}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="tabular-nums">
              {formatarQuantidade(paraNumero(linha.quantidade))}
              {linha.unidadeSigla ? ` ${linha.unidadeSigla}` : ""}
            </span>
          );
        },
      },
      ...fornecedores.map(
        (fornecedor): ColumnDef<LinhaMapa, unknown> => ({
          id: fornecedor.id,
          header: () => (
            // `ml-auto` porque `block` não obedece ao `text-right` da célula: o
            // nome ficava colado na borda ESQUERDA da coluna, desalinhado dos
            // preços que ele encabeça.
            <span
              className="ml-auto block max-w-40 truncate"
              title={fornecedor.fornecedorNome}
            >
              {fornecedor.fornecedorNome}
            </span>
          ),
          size: editavel ? 150 : 140,
          enableSorting: false,
          meta: {
            alinharDireita: true,
            naoTruncar: true,
            rotulo: fornecedor.fornecedorNome,
            // Menor preço por linha em verde.
            classeDaCelula: (linha) =>
              ehMenorDaLinha(linha, fornecedor.id) ? CLASSE_MENOR : undefined,
          },
          cell: ({ row }) => {
            const linha = row.original;
            const precoTexto = linha.precos[fornecedor.id] ?? "";
            const preco = paraNumero(precoTexto);
            const ehMenor = ehMenorDaLinha(linha, fornecedor.id);
            if (editavel) {
              return (
                <InputPreco
                  valor={precoTexto}
                  onValorChange={(valor) =>
                    alterarPreco(linha.insumoId, fornecedor.id, valor)
                  }
                  className={cn(
                    "ml-auto h-8 w-28",
                    ehMenor && "text-status-aprovado",
                  )}
                  ariaLabel={`Preço de ${linha.insumoNome} no fornecedor ${fornecedor.fornecedorNome}`}
                />
              );
            }
            return preco > 0 ? (
              <MoneyText
                valor={preco}
                className={cn(
                  "inline",
                  ehMenor && "text-status-aprovado font-medium",
                )}
              />
            ) : (
              <CelulaVazia />
            );
          },
        }),
      ),
      ...(editavel
        ? [
            {
              id: "remover",
              header: "",
              size: 56,
              enableSorting: false,
              enableHiding: false,
              meta: { alinharDireita: true, fixa: true, rotulo: "Remover" },
              cell: ({ row }) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${row.original.insumoNome}`}
                  onClick={() =>
                    setLinhas((atual) =>
                      atual.filter(
                        (linha) => linha.insumoId !== row.original.insumoId,
                      ),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ),
            } satisfies ColumnDef<LinhaMapa, unknown>,
          ]
        : []),
    ];
  }, [fornecedores, editavel]);

  // Menor total por coluna em verde. Troca só a `meta`; a `cell` continua a
  // mesma função, e o campo, o mesmo elemento.
  const colunas = React.useMemo<ColumnDef<LinhaMapa, unknown>[]>(() => {
    const sugeridos = new Set(menoresTotais.split(","));
    return colunasBase.map((coluna) =>
      coluna.id !== undefined && sugeridos.has(coluna.id)
        ? { ...coluna, meta: { ...coluna.meta, classeDoRodape: CLASSE_MENOR_RODAPE } }
        : coluna,
    );
  }, [colunasBase, menoresTotais]);

  // O Total por fornecedor, preso ao id da coluna dele.
  const rodape: Record<string, React.ReactNode> = {
    insumo: <span className="font-medium">Total</span>,
  };
  for (const fornecedor of fornecedores) {
    const total = calc.totalPorFornecedor.get(fornecedor.id) ?? 0;
    const ehMenorTotal = total > 0 && total === calc.menorTotal;
    rodape[fornecedor.id] = (
      <>
        <MoneyText
          valor={total}
          className={cn(
            "inline font-medium",
            ehMenorTotal && "text-status-aprovado",
          )}
        />
        {ehMenorTotal ? (
          <span className="block text-legenda font-medium text-status-aprovado">
            sugerido
          </span>
        ) : null}
      </>
    );
  }

  function adicionarInsumo() {
    if (insumoNovo === "") return;
    const insumo = insumos.find((item) => item.id === insumoNovo);
    if (!insumo) return;
    setLinhas((atual) => [
      ...atual,
      {
        insumoId: insumo.id,
        insumoNome: insumo.nome,
        insumoCodigo: insumo.codigo,
        unidadeSigla: insumo.unidadeSigla,
        quantidade: "",
        precos: {},
      },
    ]);
    setInsumoNovo("");
  }

  async function salvar() {
    // Só manda células com preço lançado; quantidade vem da linha do insumo.
    const payload: {
      cotacaoFornecedorId: string;
      insumoId: string;
      quantidade: number;
      precoUnitario: number;
    }[] = [];

    for (const linha of linhas) {
      const quantidade = paraNumero(linha.quantidade);
      if (quantidade <= 0) {
        toast.error(`Informe a quantidade do insumo ${linha.insumoNome}`);
        return;
      }
      for (const fornecedor of fornecedores) {
        const preco = paraNumero(linha.precos[fornecedor.id] ?? "");
        if (preco > 0) {
          payload.push({
            cotacaoFornecedorId: fornecedor.id,
            insumoId: linha.insumoId,
            quantidade,
            precoUnitario: preco,
          });
        }
      }
    }

    setSalvando(true);
    const resultado = await salvarPrecos(cotacao.id, payload);
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Preços salvos");
  }

  if (fornecedores.length === 0) {
    return (
      <EmptyState
        titulo="Sem fornecedores ainda"
        descricao="Adicione pelo menos um fornecedor para montar o mapa de preços"
        className="border-none bg-transparent"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        idTabela="compras.cotacoes.mapa"
        columns={colunas}
        data={dados}
        idDaLinha={(linha) => linha.insumoId}
        semPaginacao
        cabecalhoFixo
        alturaMaxima="calc(100vh - 22rem)"
        rodape={rodape}
        emptyState={
          editavel ? "Adicione insumos para cotar" : "Sem insumos nesta cotação"
        }
      />

      {editavel ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Combobox
              valor={insumoNovo}
              onValorChange={setInsumoNovo}
              opcoes={insumosDisponiveis.map((insumo) => ({
                valor: insumo.id,
                rotulo: rotuloInsumo(insumo.nome, insumo.unidadeSigla),
              }))}
              placeholder={
                insumosDisponiveis.length === 0
                  ? "Todos os insumos já estão no mapa"
                  : "Adicionar insumo"
              }
              disabled={insumosDisponiveis.length === 0}
              size="sm"
              className="w-64 text-detalhe"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={adicionarInsumo}
              disabled={insumoNovo === ""}
            >
              <Plus />
              Adicionar
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              void salvar();
            }}
            disabled={salvando}
          >
            <Save />
            {salvando ? "Salvando..." : "Salvar preços"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
