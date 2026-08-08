"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, HandCoins, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CelulaVazia,
  colunaDinheiro,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { removerAdiantamento } from "@/modules/rh/adiantamentos/actions";
import type { AdiantamentoLista } from "@/modules/rh/adiantamentos/queries";
import { naFaixa, noPeriodo } from "@/modules/rh/_shared/filtros";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { AdiantamentoFormDrawer } from "./adiantamento-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

/** Opções do filtro de situação: espelham a coluna Situação da tabela. */
const OPCOES_SITUACAO = [
  { valor: "aberto", rotulo: "Em aberto" },
  { valor: "folha", rotulo: "Na folha" },
];

export interface AdiantamentosTabelaProps {
  adiantamentos: AdiantamentoLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Permissão para abrir o lançamento no Financeiro (financeiro.lancamentos:ver). */
  podeVerLancamento: boolean;
}

/** Competência (yyyy-MM-01) como MM/AAAA. */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Opções do filtro de competência: cada mês presente na listagem. */
function opcoesCompetencia(adiantamentos: AdiantamentoLista[]) {
  const vistos = new Map<string, string>();
  for (const item of adiantamentos) {
    if (!vistos.has(item.competencia)) {
      vistos.set(item.competencia, formatarCompetencia(item.competencia));
    }
  }
  return [...vistos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([valor, rotulo]) => ({ valor, rotulo }));
}

/**
 * Listagem de adiantamentos: busca por colaborador, filtro por competência,
 * criação, edição e exclusão no drawer. Editar e excluir só aparecem para
 * adiantamentos em aberto (fora de folha) e com permissão.
 */
export function AdiantamentosTabela({
  adiantamentos,
  colaboradores,
  podeCriar,
  podeEditar,
  podeExcluir,
  podeVerLancamento,
}: AdiantamentosTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [competencia, setCompetencia] = useFiltroSessao("competencia", "");
  const [colaboradorId, setColaboradorId] = useFiltroSessao("colaboradorId", "");
  const [situacao, setSituacao] = useFiltroSessao("situacao", "");
  const [dataDe, setDataDe] = useFiltroSessao("dataDe", "");
  const [dataAte, setDataAte] = useFiltroSessao("dataAte", "");
  const [valorDe, setValorDe] = useFiltroSessao("valorDe", "");
  const [valorAte, setValorAte] = useFiltroSessao("valorAte", "");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<AdiantamentoLista | null>(
    null,
  );

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<AdiantamentoLista | null>(
    null,
  );

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(adiantamento: AdiantamentoLista) {
    setEmEdicao(adiantamento);
    setDrawerAberto(true);
  }

  function pedirExclusao(adiantamento: AdiantamentoLista) {
    setAExcluir(adiantamento);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerAdiantamento(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Adiantamento excluído");
  }

  const opcoesMes = React.useMemo(
    () => opcoesCompetencia(adiantamentos),
    [adiantamentos],
  );

  // Filtro em memória: a tela carrega todos os adiantamentos (sem paginação
  // server-side), então o total exibido continua sendo o total real.
  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return adiantamentos.filter((item) => {
      if (competencia && item.competencia !== competencia) return false;
      if (colaboradorId && item.colaboradorId !== colaboradorId) return false;
      if (situacao === "folha" && !item.naFolha) return false;
      if (situacao === "aberto" && item.naFolha) return false;
      if (!noPeriodo(item.data, dataDe, dataAte)) return false;
      if (!naFaixa(item.valor, valorDe, valorAte)) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [
    adiantamentos,
    busca,
    competencia,
    colaboradorId,
    situacao,
    dataDe,
    dataAte,
    valorDe,
    valorAte,
  ]);

  const podeAgir = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<AdiantamentoLista, unknown>[]>(() => {
    const base: ColumnDef<AdiantamentoLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "competencia",
        header: "Competência",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarCompetencia(row.original.competencia)}
          </span>
        ),
      },
      colunaDinheiro<AdiantamentoLista>("valor", "Valor"),
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.data)}
          </span>
        ),
      },
      {
        accessorKey: "naFolha",
        header: "Situação",
        cell: ({ row }) =>
          row.original.naFolha ? (
            <StatusBadge status="aprovado" rotulo="Na folha" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Em aberto" />
          ),
      },
      {
        id: "lancamento",
        header: "No Financeiro",
        cell: ({ row }) => {
          const { lancamentoId, lancamentoNumero } = row.original;
          if (!lancamentoId) return <CelulaVazia />;

          const rotulo = lancamentoNumero ?? "Abrir lançamento";
          if (!podeVerLancamento) {
            return <span className="codigo-doc text-muted-foreground">{rotulo}</span>;
          }
          return (
            <Link
              href={`/financeiro/lancamentos/${lancamentoId}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <span className="codigo-doc">{rotulo}</span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          );
        },
      },
    ];

    if (!podeAgir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const adiantamento = row.original;
        // Travado na folha ou com pagamento comprometido (aprovado, pago ou
        // conciliado): sem ações de editar/excluir.
        if (adiantamento.naFolha || adiantamento.pagamentoComprometido) {
          return null;
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${adiantamento.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(adiantamento)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => pedirExclusao(adiantamento)}
                >
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeAgir, podeEditar, podeExcluir, podeVerLancamento]);

  return (
    <>
      <DataTable
        idTabela="rh.adiantamentos"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por colaborador",
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por colaborador"
              />
            ),
          },
          {
            id: "competencia",
            rotulo: "Competência",
            temValor: competencia !== "",
            onLimpar: () => setCompetencia(""),
            elemento: (
              <FiltroSelect
                valor={competencia}
                onValorChange={setCompetencia}
                opcoes={opcoesMes}
                placeholder="Competência"
                todosRotulo="Todas as competências"
              />
            ),
          },
          {
            id: "colaborador",
            rotulo: "Colaborador",
            ocultoPorPadrao: true,
            temValor: colaboradorId !== "",
            onLimpar: () => setColaboradorId(""),
            elemento: (
              <FiltroSelect
                valor={colaboradorId}
                onValorChange={setColaboradorId}
                opcoes={colaboradores.map((colaborador) => ({
                  valor: colaborador.id,
                  rotulo: colaborador.nome,
                }))}
                placeholder="Colaborador"
                todosRotulo="Todos os colaboradores"
                className="max-w-56"
              />
            ),
          },
          {
            id: "situacao",
            rotulo: "Situação",
            ocultoPorPadrao: true,
            temValor: situacao !== "",
            onLimpar: () => setSituacao(""),
            elemento: (
              <FiltroSelect
                valor={situacao}
                onValorChange={setSituacao}
                opcoes={OPCOES_SITUACAO}
                placeholder="Situação"
                todosRotulo="Todas as situações"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período do adiantamento",
            ocultoPorPadrao: true,
            temValor: dataDe !== "" || dataAte !== "",
            onLimpar: () => {
              setDataDe("");
              setDataAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={dataDe}
                ate={dataAte}
                rotulo="Data"
                onPeriodoChange={(de, ate) => {
                  setDataDe(de);
                  setDataAte(ate);
                }}
              />
            ),
          },
          {
            id: "valor",
            rotulo: "Faixa de valor",
            ocultoPorPadrao: true,
            temValor: valorDe !== "" || valorAte !== "",
            onLimpar: () => {
              setValorDe("");
              setValorAte("");
            },
            elemento: (
              <FiltroValor
                de={valorDe}
                ate={valorAte}
                onValorChange={(de, ate) => {
                  setValorDe(de);
                  setValorAte(ate);
                }}
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={HandCoins}
            titulo="Nenhum adiantamento encontrado"
            descricao="Registre adiantamentos por colaborador e competência. Eles são descontados na folha gerencial."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo adiantamento
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <AdiantamentoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          adiantamento={emEdicao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir adiantamento"
          descricao={
            aExcluir
              ? `Excluir o adiantamento de ${aExcluir.colaboradorNome}? Essa ação não pode ser desfeita.`
              : ""
          }
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
