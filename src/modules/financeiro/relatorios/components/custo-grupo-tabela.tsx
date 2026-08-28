"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { CelulaVazia, MoneyText } from "@/components/canonicos";
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
import { CLASSE_COR_GRUPO } from "@/modules/cadastros/_shared/insumo-grupos";
import { insumosDaSubcategoria } from "@/modules/financeiro/relatorios/actions";
import { drillGrupoInsumo } from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { CustoPorGrupo } from "@/modules/financeiro/relatorios/queries";

export interface CustoGrupoTabelaProps {
  custo: CustoPorGrupo;
  /** Mês de referência (yyyy-MM), repassado ao carregar o nível de insumo. */
  mes: string;
  /** Sem permissão de ver lançamentos, o grupo não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

interface LinhaInsumo {
  nome: string;
  quantidade: number;
  valor: number;
}

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";

/**
 * Percentual que a linha representa no total do mês, na mesma casa decimal nos
 * três níveis.
 *
 * Uma casa, e não as duas do `formatarPercentual`, porque a coluna existe para
 * ordenar de olho ("este grupo é um terço do mês"), não para conferir conta.
 */
function PercentualDoMes({ valor, total }: { valor: number; total: number }) {
  const percentual = total === 0 ? 0 : (valor / total) * 100;
  return (
    <>
      {percentual.toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}
      %
    </>
  );
}

/**
 * Custo por grupo com drill-down em três níveis: grupo, subcategoria e insumo.
 *
 * Grupo e subcategoria vêm prontos do servidor (são poucas linhas). O nível de
 * insumo é buscado sob demanda ao abrir a subcategoria: é o único que pode ter
 * centenas de linhas, e ninguém abre todas.
 *
 * A QUANTIDADE tem coluna própria. Antes ela era escrita debaixo do cabeçalho
 * "% do mês", só na linha de insumo: os litros de diesel apareciam onde os dois
 * níveis de cima mostravam percentual, sem unidade e sem aviso. Número embaixo
 * de cabeçalho errado é o pior defeito de leitura que uma tabela pode ter, e o
 * conserto é dar coluna a cada grandeza — agora o percentual existe nos três
 * níveis e a quantidade só onde ela quer dizer alguma coisa.
 */
export function CustoGrupoTabela({
  custo,
  mes,
  podeVerLancamentos,
}: CustoGrupoTabelaProps) {
  const [gruposAbertos, setGruposAbertos] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [subsAbertas, setSubsAbertas] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [insumos, setInsumos] = React.useState<Record<string, LinhaInsumo[]>>(
    {},
  );
  const [carregando, setCarregando] = React.useState<string | null>(null);

  function alternarGrupo(chave: string) {
    setGruposAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  async function alternarSub(categoriaId: string) {
    const aberta = subsAbertas.has(categoriaId);
    setSubsAbertas((atual) => {
      const proximo = new Set(atual);
      if (aberta) proximo.delete(categoriaId);
      else proximo.add(categoriaId);
      return proximo;
    });
    if (aberta || insumos[categoriaId]) return;

    setCarregando(categoriaId);
    const resultado = await insumosDaSubcategoria(categoriaId, mes);
    setCarregando(null);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setInsumos((atual) => ({ ...atual, [categoriaId]: resultado.insumos }));
  }

  return (
    // `overflow-x-auto`, e não `overflow-hidden`: com o recuo de 6rem do
    // terceiro nível e nome de insumo comprido, o conteúdo passava da largura e
    // era CORTADO, sem barra para chegar nele. Quem traz a barra é o contêiner
    // do `Table` canônico, o mesmo das outras oito tabelas do relatório.
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader className="bg-surface">
          <TableRow className="hover:bg-transparent">
            {/* A ÚNICA coluna do app que continua à esquerda, e é de propósito:
                aqui o recuo (pl-12 na subcategoria, pl-24 no insumo) é o que diz
                de quem a linha é filha. Centralizar centraliza dentro do recuo e
                a hierarquia do drill-down desaparece. As colunas de quantidade,
                percentual e dinheiro seguem à direita, como no resto do app. */}
            <TableHead className={cn(CABECALHO, "text-left")}>
              Grupo, subcategoria e insumo
            </TableHead>
            <TableHead
              className={cn(CABECALHO, "w-32 text-right")}
              title="Quantidade consumida no mês, na unidade de cada insumo. Só a linha de insumo tem uma unidade só."
            >
              Quantidade
            </TableHead>
            <TableHead className={cn(CABECALHO, "w-28 text-right")}>
              % do mês
            </TableHead>
            <TableHead className={cn(CABECALHO, "w-40 text-right")}>
              Custo
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {custo.grupos.map((grupo) => {
            const chave = grupo.grupoId ?? "sem-insumo";
            const aberto = gruposAbertos.has(chave);
            return (
              <React.Fragment key={chave}>
                <TableRow>
                  <TableCell className="py-2 text-detalhe">
                    <div className="flex items-center gap-1.5">
                      {grupo.subcategorias.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            aberto
                              ? `Fechar ${grupo.nome}`
                              : `Abrir ${grupo.nome}`
                          }
                          onClick={() => alternarGrupo(chave)}
                        >
                          {aberto ? <ChevronDown /> : <ChevronRight />}
                        </Button>
                      ) : (
                        <span className="inline-block w-8" />
                      )}
                      {/*
                        Só o grupo SEM insumo (grupoId nulo, o lançamento avulso)
                        vira link. O grupo com insumo soma
                        `oc_itens.quantidade * preco_unitario`, não o valor do
                        lançamento, então a lista de lançamentos não fecharia com
                        a célula — e `drillGrupoInsumo` lança se for chamado
                        assim. Não acontece hoje: há 0 ordens de compra.
                      */}
                      {grupo.grupoId === null && podeVerLancamentos ? (
                        <LinkDrill
                          href={drillGrupoInsumo({
                            grupoId: null,
                            periodo: { mes },
                          })}
                          titulo={`Ver os lançamentos de ${grupo.nome} neste mês`}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-legenda font-medium",
                            CLASSE_COR_GRUPO[grupo.cor],
                          )}
                        >
                          {grupo.nome}
                        </LinkDrill>
                      ) : (
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-legenda font-medium",
                            CLASSE_COR_GRUPO[grupo.cor],
                          )}
                        >
                          {grupo.nome}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {/* Grupo e subcategoria não têm quantidade: somar litro de
                      diesel com hora de máquina daria um número que não existe.
                      A CelulaVazia diz "não informado" em vez de deixar buraco. */}
                  <TableCell className="py-2 text-right text-detalhe">
                    <CelulaVazia />
                  </TableCell>
                  <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
                    <PercentualDoMes valor={grupo.valor} total={custo.total} />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <MoneyText
                      valor={grupo.valor}
                      className="text-detalhe font-medium"
                    />
                  </TableCell>
                </TableRow>

                {aberto
                  ? grupo.subcategorias.map((sub) => {
                      const subAberta = subsAbertas.has(sub.categoriaId);
                      const linhas = insumos[sub.categoriaId] ?? [];
                      return (
                        <React.Fragment key={sub.categoriaId}>
                          <TableRow className="bg-surface/40">
                            <TableCell className="py-1.5 pl-12 text-detalhe">
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={
                                    subAberta
                                      ? `Fechar ${sub.nome}`
                                      : `Abrir ${sub.nome}`
                                  }
                                  onClick={() =>
                                    void alternarSub(sub.categoriaId)
                                  }
                                >
                                  {carregando === sub.categoriaId ? (
                                    <LoaderCircle className="animate-spin" />
                                  ) : subAberta ? (
                                    <ChevronDown />
                                  ) : (
                                    <ChevronRight />
                                  )}
                                </Button>
                                {sub.nome}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-detalhe">
                              <CelulaVazia />
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-detalhe tabular-nums text-muted-foreground">
                              <PercentualDoMes
                                valor={sub.valor}
                                total={custo.total}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-right">
                              <MoneyText
                                valor={sub.valor}
                                className="text-detalhe"
                              />
                            </TableCell>
                          </TableRow>

                          {subAberta
                            ? linhas.map((insumo) => (
                                <TableRow key={insumo.nome}>
                                  <TableCell className="py-1.5 pl-24 text-detalhe text-muted-foreground">
                                    {insumo.nome}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right text-detalhe tabular-nums text-muted-foreground">
                                    {formatarQuantidade(insumo.quantidade)}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right text-detalhe tabular-nums text-muted-foreground">
                                    <PercentualDoMes
                                      valor={insumo.valor}
                                      total={custo.total}
                                    />
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right">
                                    <MoneyText
                                      valor={insumo.valor}
                                      className="text-detalhe"
                                    />
                                  </TableCell>
                                </TableRow>
                              ))
                            : null}
                        </React.Fragment>
                      );
                    })
                  : null}
              </React.Fragment>
            );
          })}

          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell className="py-2 text-detalhe font-semibold text-foreground">
              Total do mês
            </TableCell>
            <TableCell className="py-2 text-right text-detalhe">
              <CelulaVazia />
            </TableCell>
            <TableCell className="py-2 text-right text-detalhe font-semibold tabular-nums">
              100,0%
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={custo.total}
                className="text-detalhe font-semibold"
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
