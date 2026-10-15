"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import type { ColumnDef } from "@tanstack/react-table";

import { CelulaVazia, DataTable, MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { CLASSE_COR_GRUPO } from "@/modules/cadastros/_shared/insumo-grupos";
import { insumosDaSubcategoria } from "@/modules/financeiro/relatorios/actions";
import {
  drillGrupoInsumo,
  type PeriodoCompetencia,
  type RecorteCustoGrupo,
} from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { CustoPorGrupo } from "@/modules/financeiro/relatorios/queries";

export interface CustoGrupoTabelaProps {
  custo: CustoPorGrupo;
  /**
   * O período do relatório, repassado ao carregar o nível de insumo e no link do
   * drill. Não é mais um mês: a tela oferece mês, janela e tudo.
   */
  periodo: PeriodoCompetencia;
  /**
   * Centro e categoria escolhidos. Descem junto para o nível de insumo e para o
   * drill — sem eles, abrir uma subcategoria de R$ 12 mil listaria insumos de
   * todos os centros, e o filho não fecharia com o pai.
   */
  recorte: RecorteCustoGrupo;
  /** Sem permissão de ver lançamentos, o grupo não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

interface LinhaInsumo {
  nome: string;
  quantidade: number;
  valor: number;
}

type GrupoCusto = CustoPorGrupo["grupos"][number];
type SubcategoriaCusto = GrupoCusto["subcategorias"][number];

/** Uma linha da tabela, em qualquer dos três níveis do drill-down. */
type LinhaCusto =
  | {
      tipo: "grupo";
      id: string;
      chave: string;
      aberto: boolean;
      grupo: GrupoCusto;
    }
  | {
      tipo: "sub";
      id: string;
      aberta: boolean;
      /** O nível de insumo já veio do servidor (não busca de novo). */
      carregada: boolean;
      carregando: boolean;
      sub: SubcategoriaCusto;
    }
  | { tipo: "insumo"; id: string; insumo: LinhaInsumo }
  | {
      tipo: "categoria";
      id: string;
      categoria: NonNullable<GrupoCusto["categorias"]>[number];
    };

function valorDaLinha(linha: LinhaCusto): number {
  if (linha.tipo === "grupo") return linha.grupo.valor;
  if (linha.tipo === "sub") return linha.sub.valor;
  if (linha.tipo === "categoria") return linha.categoria.valor;
  return linha.insumo.valor;
}

/**
 * Percentual que a linha representa no total do período, na mesma casa decimal
 * nos três níveis.
 *
 * Uma casa, e não as duas do `formatarPercentual`, porque a coluna existe para
 * ordenar de olho ("este grupo é um terço do período"), não para conferir conta.
 */
function PercentualDoTotal({ valor, total }: { valor: number; total: number }) {
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
  periodo,
  recorte,
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

  const alternarGrupo = React.useCallback((chave: string) => {
    setGruposAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }, []);

  // `aberta` e `carregada` vêm da linha, e não do estado, para a função não
  // mudar a cada clique e as colunas da tabela não serem refeitas à toa.
  const alternarSub = React.useCallback(
    async (categoriaId: string, aberta: boolean, carregada: boolean) => {
      setSubsAbertas((atual) => {
        const proximo = new Set(atual);
        if (aberta) proximo.delete(categoriaId);
        else proximo.add(categoriaId);
        return proximo;
      });
      if (aberta || carregada) return;

      setCarregando(categoriaId);
      const resultado = await insumosDaSubcategoria(
        categoriaId,
        periodo,
        recorte.centroCustoId,
        // O CAPEX desce para o insumo junto: ligado no grupo e desligado aqui, a
        // máquina comprada sumiria do nível 3 e o filho não fecharia com o pai.
        recorte.incluirInvestimento,
      );
      setCarregando(null);

      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      setInsumos((atual) => ({ ...atual, [categoriaId]: resultado.insumos }));
    },
    [periodo, recorte],
  );

  // A árvore achatada na ordem em que aparece: o grupo, e embaixo dele as
  // subcategorias e os insumos que estiverem abertos. Não é o modo árvore do
  // DataTable porque aqui tudo nasce fechado e o nível de insumo só existe
  // depois de buscado no servidor.
  const dados = React.useMemo<LinhaCusto[]>(() => {
    const linhas: LinhaCusto[] = [];
    for (const grupo of custo.grupos) {
      const chave = grupo.grupoId ?? "sem-insumo";
      const aberto = gruposAbertos.has(chave);
      linhas.push({
        tipo: "grupo",
        id: `grupo:${chave}`,
        chave,
        aberto,
        grupo,
      });
      if (!aberto) continue;
      // A linha "Sem insumo" não tem subcategoria de insumo: abre pela
      // categoria financeira, que é o que diz para onde foi esse dinheiro.
      for (const categoria of grupo.categorias ?? []) {
        linhas.push({
          tipo: "categoria",
          id: `categoria:${categoria.categoriaId ?? "sem"}`,
          categoria,
        });
      }
      for (const sub of grupo.subcategorias) {
        const subAberta = subsAbertas.has(sub.categoriaId);
        const carregados = insumos[sub.categoriaId];
        linhas.push({
          tipo: "sub",
          id: `sub:${sub.categoriaId}`,
          aberta: subAberta,
          carregada: carregados !== undefined,
          carregando: carregando === sub.categoriaId,
          sub,
        });
        if (!subAberta) continue;
        for (const insumo of carregados ?? []) {
          linhas.push({
            tipo: "insumo",
            id: `insumo:${sub.categoriaId}:${insumo.nome}`,
            insumo,
          });
        }
      }
    }
    return linhas;
  }, [custo.grupos, gruposAbertos, subsAbertas, insumos, carregando]);

  // Sem ordenação em coluna nenhuma: ordenar misturaria insumo de uma
  // subcategoria com grupo de outra e a hierarquia do drill-down se perderia.
  const colunas = React.useMemo<ColumnDef<LinhaCusto, unknown>[]>(
    () => [
      {
        id: "nome",
        // Continua à esquerda de propósito (como o Centro dos custos indiretos):
        // aqui o recuo (pl-12 na subcategoria, pl-24 no insumo) é o que diz
        // de quem a linha é filha. Centralizar centraliza dentro do recuo e
        // a hierarquia do drill-down desaparece. As colunas de quantidade,
        // percentual e dinheiro seguem à direita, como no resto do app.
        header: () => (
          <span className="block text-left">Grupo, subcategoria e insumo</span>
        ),
        size: 360,
        enableSorting: false,
        meta: {
          rotulo: "Grupo, subcategoria e insumo",
          naoTruncar: true,
          celular: "titulo",
        },
        cell: ({ row }) => {
          const linha = row.original;
          if (linha.tipo === "grupo") {
            const { grupo, chave, aberto } = linha;
            return (
              <div className="flex items-center gap-1.5 text-left">
                {grupo.subcategorias.length > 0 ||
                (grupo.categorias?.length ?? 0) > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      aberto ? `Fechar ${grupo.nome}` : `Abrir ${grupo.nome}`
                    }
                    onClick={() => alternarGrupo(chave)}
                  >
                    {aberto ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                ) : (
                  <span className="inline-block w-8 shrink-0" />
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
                      periodo,
                      recorte,
                    })}
                    titulo={`Ver os lançamentos de ${grupo.nome} neste recorte`}
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
            );
          }
          if (linha.tipo === "categoria") {
            // Sem link de propósito: a categoria daqui é a do RATEIO (caindo
            // na do lançamento), e o filtro `categoria=` da lista de lançamentos
            // olha só o lançamento. Em 2026 são 110 rateios (R$ 1,70 mi) com
            // categoria própria, e a lista não fecharia com a célula. O link do
            // grupo "Sem insumo", acima, continua fechando.
            const { categoria } = linha;
            return (
              <div
                className={cn(
                  "pl-12 text-left",
                  categoria.categoriaId === null && "italic text-muted-foreground",
                )}
                title={
                  categoria.categoriaId === null
                    ? "Rateio sem categoria financeira, nem no rateio nem no lançamento"
                    : undefined
                }
              >
                {categoria.nome}
              </div>
            );
          }
          if (linha.tipo === "sub") {
            const { sub, aberta, carregada, carregando: buscando } = linha;
            return (
              <div className="flex items-center gap-1.5 pl-12 text-left">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    aberta ? `Fechar ${sub.nome}` : `Abrir ${sub.nome}`
                  }
                  onClick={() =>
                    void alternarSub(sub.categoriaId, aberta, carregada)
                  }
                >
                  {buscando ? (
                    <LoaderCircle className="animate-spin" />
                  ) : aberta ? (
                    <ChevronDown />
                  ) : (
                    <ChevronRight />
                  )}
                </Button>
                {sub.nome}
              </div>
            );
          }
          return (
            <div className="pl-24 text-left text-muted-foreground">
              {linha.insumo.nome}
            </div>
          );
        },
      },
      {
        id: "quantidade",
        header: () => (
          <span title="Quantidade consumida no período, na unidade de cada insumo. Só a linha de insumo tem uma unidade só.">
            Quantidade
          </span>
        ),
        size: 128,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true, rotulo: "Quantidade" },
        // Grupo e subcategoria não têm quantidade: somar litro de diesel com
        // hora de máquina daria um número que não existe. A CelulaVazia diz
        // "não informado" em vez de deixar buraco.
        cell: ({ row }) =>
          row.original.tipo === "insumo" ? (
            <span className="tabular-nums text-muted-foreground">
              {formatarQuantidade(row.original.insumo.quantidade)}
            </span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        id: "percentual",
        header: "% do total",
        size: 112,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true, rotulo: "% do total" },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            <PercentualDoTotal
              valor={valorDaLinha(row.original)}
              total={custo.total}
            />
          </span>
        ),
      },
      {
        id: "custo",
        header: "Custo",
        size: 160,
        enableSorting: false,
        meta: {
          alinharDireita: true,
          atomico: true,
          rotulo: "Custo",
          celular: "valor",
        },
        cell: ({ row }) => (
          <MoneyText
            valor={valorDaLinha(row.original)}
            className={
              row.original.tipo === "grupo" ? "font-medium" : undefined
            }
          />
        ),
      },
    ],
    [
      alternarGrupo,
      alternarSub,
      custo.total,
      periodo,
      podeVerLancamentos,
      recorte,
    ],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.custo-grupo"
      columns={colunas}
      data={dados}
      idDaLinha={(linha) => linha.id}
      semPaginacao
      classeDaLinha={(linha) =>
        linha.tipo === "sub" || linha.tipo === "categoria" ? "bg-surface/40" : undefined
      }
      rodape={{
        nome: (
          <span className="font-semibold text-foreground">
            Total do período
          </span>
        ),
        quantidade: <CelulaVazia />,
        percentual: <span className="font-semibold tabular-nums">100,0%</span>,
        custo: <MoneyText valor={custo.total} className="font-semibold" />,
      }}
    />
  );
}
