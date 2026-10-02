"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
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
import { removerDiaria } from "@/modules/rh/diaristas/actions";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";
import { formatarCompetencia } from "@/modules/rh/diaristas/schemas";
import { filtrarDiarias, SEM_OBRA } from "@/modules/rh/diaristas/filtros";
import type {
  DiaristaOpcao,
  ObraOpcao,
} from "@/modules/rh/_shared/queries";
import { DiariaFormDrawer } from "./diaria-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

/** Opções do filtro de situação: espelham a coluna Situação da tabela. */
const OPCOES_SITUACAO = [
  { valor: "aberto", rotulo: "Em aberto" },
  { valor: "paga", rotulo: "Paga" },
];

export interface DiariasTabelaProps {
  diarias: DiariaLista[];
  diaristas: DiaristaOpcao[];
  obras: ObraOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/** Opções do filtro de competência: cada mês presente na listagem. */
function opcoesCompetencia(diarias: DiariaLista[]) {
  const vistos = new Map<string, string>();
  for (const item of diarias) {
    if (!vistos.has(item.competencia)) {
      vistos.set(item.competencia, formatarCompetencia(item.competencia));
    }
  }
  return [...vistos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([valor, rotulo]) => ({ valor, rotulo }));
}

/**
 * Listagem de diárias: busca por diarista, filtro por competência, registro,
 * edição e exclusão no drawer. Editar e excluir só aparecem para diárias em
 * aberto (não fechadas) e com permissão de editar.
 */
export function DiariasTabela({
  diarias,
  diaristas,
  obras,
  podeCriar,
  podeEditar,
}: DiariasTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [competencia, setCompetencia] = useFiltroSessao("competencia", "");
  const [obraId, setObraId] = useFiltroSessao("obraId", "");
  const [colaboradorId, setColaboradorId] = useFiltroSessao("colaboradorId", "");
  const [dataDe, setDataDe] = useFiltroSessao("dataDe", "");
  const [dataAte, setDataAte] = useFiltroSessao("dataAte", "");
  const [valorDe, setValorDe] = useFiltroSessao("valorDe", "");
  const [valorAte, setValorAte] = useFiltroSessao("valorAte", "");
  const [situacao, setSituacao] = useFiltroSessao("situacao", "");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<DiariaLista | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<DiariaLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(diaria: DiariaLista) {
    setEmEdicao(diaria);
    setDrawerAberto(true);
  }

  function pedirExclusao(diaria: DiariaLista) {
    setAExcluir(diaria);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerDiaria(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Diária excluída");
  }

  const opcoesMes = React.useMemo(
    () => opcoesCompetencia(diarias),
    [diarias],
  );

  const opcoesObra = React.useMemo(
    () => [
      ...obras.map((obra) => ({
        valor: obra.id,
        rotulo: obra.lote ? `${obra.nome} (Lote ${obra.lote})` : obra.nome,
      })),
      // A diária pode ser lançada sem obra, e a coluna mostra "Sem obra": sem
      // essa opção não haveria como achá-las.
      { valor: SEM_OBRA, rotulo: "Sem obra" },
    ],
    [obras],
  );

  const opcoesDiarista = React.useMemo(
    () =>
      diaristas.map((diarista) => ({
        valor: diarista.id,
        rotulo: diarista.nome,
      })),
    [diaristas],
  );

  // Filtro em memória: a tela carrega todas as diárias (sem paginação
  // server-side), então o total exibido continua sendo o total real. Facetado
  // (ver `diaristas/filtros`).
  const { linhas: dados, opcoes } = React.useMemo(
    () =>
      filtrarDiarias(diarias, {
        busca,
        competencia,
        obraId,
        colaboradorId,
        situacao,
        dataDe,
        dataAte,
        valorDe,
        valorAte,
      }),
    [
      diarias,
      busca,
      competencia,
      obraId,
      colaboradorId,
      situacao,
      dataDe,
      dataAte,
      valorDe,
      valorAte,
    ],
  );

  const colunas = React.useMemo<ColumnDef<DiariaLista, unknown>[]>(() => {
    const base: ColumnDef<DiariaLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "obraNome",
        header: "Obra",
        cell: ({ row }) => {
          const { obraNome, obraLote } = row.original;
          if (!obraNome) {
            return <span className="text-muted-foreground">Sem obra</span>;
          }
          return (
            <span>
              {obraNome}
              {obraLote ? ` - Lote ${obraLote}` : ""}
            </span>
          );
        },
      },
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatarData(row.original.data)}</span>
        ),
      },
      {
        accessorKey: "competencia",
        header: "Competência",
        // Secundária: já existe o filtro de competência acima da tabela.
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarCompetencia(row.original.competencia)}
          </span>
        ),
      },
      colunaDinheiro<DiariaLista>("valor", "Valor"),
      {
        accessorKey: "fechada",
        header: "Situação",
        cell: ({ row }) =>
          row.original.fechada ? (
            <StatusBadge status="pago" rotulo="Paga" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Em aberto" />
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const diaria = row.original;
        // Travada quando fechada/paga: sem ações de editar/excluir.
        if (diaria.fechada) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${diaria.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(diaria)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => pedirExclusao(diaria)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <DataTable
        idTabela="rh.diaristas"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por diarista",
            fixo: true,
            // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
            // deixa o texto da busca filtrando a lista.
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por diarista"
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
            id: "obra",
            rotulo: "Obra",
            ocultoPorPadrao: true,
            temValor: obraId !== "",
            onLimpar: () => setObraId(""),
            elemento: (
              <FiltroSelect
                valor={obraId}
                onValorChange={setObraId}
                opcoes={opcoes("obra", opcoesObra)}
                placeholder="Obra"
                todosRotulo="Todas as obras"
                className="max-w-56"
              />
            ),
          },
          {
            id: "colaborador",
            rotulo: "Diarista",
            ocultoPorPadrao: true,
            temValor: colaboradorId !== "",
            onLimpar: () => setColaboradorId(""),
            elemento: (
              <FiltroSelect
                valor={colaboradorId}
                onValorChange={setColaboradorId}
                opcoes={opcoes("colaborador", opcoesDiarista)}
                placeholder="Diarista"
                todosRotulo="Todos os diaristas"
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
                opcoes={opcoes("situacao", OPCOES_SITUACAO)}
                placeholder="Situação"
                todosRotulo="Todas as situações"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período da diária",
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
            className="border-none bg-transparent"
            icone={CalendarClock}
            titulo="Nenhuma diária encontrada"
            descricao="Registre as diárias por diarista. No fechamento da competência elas viram um lançamento a pagar."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Nova diária
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <DiariaFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          diaristas={diaristas}
          obras={obras}
          diaria={emEdicao}
        />
      ) : null}

      {podeEditar ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir diária"
          descricao={
            aExcluir
              ? `Excluir a diária de ${aExcluir.colaboradorNome} de ${formatarData(
                  aExcluir.data,
                )}? Essa ação não pode ser desfeita.`
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
