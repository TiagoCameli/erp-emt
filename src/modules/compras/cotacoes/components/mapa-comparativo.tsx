"use client";

import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  CelulaVazia,
  Combobox,
  EmptyState,
  InputMoeda,
  InputQuantidade,
  MoneyText,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
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
 * Classes do cabeçalho do mapa. Fica fixo no topo enquanto a matriz rola, no
 * mesmo padrão das listagens (DataTable com cabecalhoFixo).
 */
const CLASSES_CABECALHO =
  "sticky top-0 z-10 h-9 bg-background px-3 text-detalhe font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--color-border)]";

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

  function alterarQuantidade(insumoId: string, valor: string) {
    setLinhas((atual) =>
      atual.map((linha) =>
        linha.insumoId === insumoId ? { ...linha, quantidade: valor } : linha,
      ),
    );
  }

  function alterarPreco(insumoId: string, fornecedorId: string, valor: string) {
    setLinhas((atual) =>
      atual.map((linha) =>
        linha.insumoId === insumoId
          ? { ...linha, precos: { ...linha.precos, [fornecedorId]: valor } }
          : linha,
      ),
    );
  }

  function removerInsumo(insumoId: string) {
    setLinhas((atual) => atual.filter((linha) => linha.insumoId !== insumoId));
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
      <div className="max-h-[calc(100vh-22rem)] overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={CLASSES_CABECALHO}>Insumo</TableHead>
              <TableHead className={cn(CLASSES_CABECALHO, "text-right")}>
                Quantidade
              </TableHead>
              {fornecedores.map((fornecedor) => (
                <TableHead
                  key={fornecedor.id}
                  className={cn(CLASSES_CABECALHO, "text-right")}
                  title={fornecedor.fornecedorNome}
                >
                  <span className="block max-w-40 truncate">
                    {fornecedor.fornecedorNome}
                  </span>
                </TableHead>
              ))}
              {editavel ? (
                <TableHead className={cn(CLASSES_CABECALHO, "w-10")} />
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={fornecedores.length + (editavel ? 3 : 2)}
                  className="h-24 text-center text-detalhe text-muted-foreground"
                >
                  {editavel
                    ? "Adicione insumos para cotar"
                    : "Sem insumos nesta cotação"}
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((linha) => {
                const menorLinha = calc.menorPorLinha.get(linha.insumoId);
                return (
                  <TableRow key={linha.insumoId} className="hover:bg-muted/50">
                    <TableCell className="px-3 text-detalhe">
                      <span className="font-medium">{linha.insumoNome}</span>
                      {linha.insumoCodigo ? (
                        <span className="ml-2 codigo-doc text-muted-foreground">
                          {linha.insumoCodigo}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-3 text-right text-detalhe">
                      {editavel ? (
                        <div className="flex items-center justify-end gap-1">
                          <InputQuantidade
                            valor={linha.quantidade}
                            onValorChange={(valor) =>
                              alterarQuantidade(linha.insumoId, valor)
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
                      )}
                    </TableCell>
                    {fornecedores.map((fornecedor) => {
                      const precoTexto = linha.precos[fornecedor.id] ?? "";
                      const preco = paraNumero(precoTexto);
                      const ehMenor =
                        preco > 0 &&
                        menorLinha !== undefined &&
                        preco === menorLinha;
                      return (
                        <TableCell
                          key={fornecedor.id}
                          className={cn(
                            "px-3 text-right text-detalhe",
                            ehMenor && "bg-status-aprovado/10",
                          )}
                        >
                          {editavel ? (
                            <InputMoeda
                              valor={precoTexto}
                              onValorChange={(valor) =>
                                alterarPreco(
                                  linha.insumoId,
                                  fornecedor.id,
                                  valor,
                                )
                              }
                              className={cn(
                                "h-8 w-28",
                                ehMenor && "text-status-aprovado",
                              )}
                              ariaLabel={`Preço de ${linha.insumoNome} no fornecedor ${fornecedor.fornecedorNome}`}
                            />
                          ) : preco > 0 ? (
                            <MoneyText
                              valor={preco}
                              className={cn(
                                "inline",
                                ehMenor && "text-status-aprovado font-medium",
                              )}
                            />
                          ) : (
                            <CelulaVazia />
                          )}
                        </TableCell>
                      );
                    })}
                    {editavel ? (
                      <TableCell className="px-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remover ${linha.insumoNome}`}
                          onClick={() => removerInsumo(linha.insumoId)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}

            <TableRow className="sticky bottom-0 border-t border-border bg-surface shadow-[inset_0_1px_0_var(--color-border)] hover:bg-surface">
              <TableCell className="px-3 text-detalhe font-medium">
                Total
              </TableCell>
              <TableCell className="px-3" />
              {fornecedores.map((fornecedor) => {
                const total = calc.totalPorFornecedor.get(fornecedor.id) ?? 0;
                const ehMenorTotal = total > 0 && total === calc.menorTotal;
                return (
                  <TableCell
                    key={fornecedor.id}
                    className={cn(
                      "px-3 text-right text-detalhe",
                      ehMenorTotal && "bg-status-aprovado/10",
                    )}
                  >
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
                  </TableCell>
                );
              })}
              {editavel ? <TableCell className="px-3" /> : null}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {editavel ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Combobox
              valor={insumoNovo}
              onValorChange={setInsumoNovo}
              opcoes={insumosDisponiveis.map((insumo) => ({
                valor: insumo.id,
                rotulo: insumo.nome,
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
