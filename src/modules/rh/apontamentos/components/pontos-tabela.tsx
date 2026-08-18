"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { CalendarClock } from "lucide-react";

import {
  CelulaVazia,
  colunaNumero,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { STATUS_PONTO, type StatusPonto } from "@/modules/rh/_shared/formato";
import type {
  ColaboradorOpcao,
  ObraOpcao,
} from "@/modules/rh/_shared/queries";
import type { PontoLista } from "@/modules/rh/apontamentos/queries";

const OPCOES_STATUS = (Object.keys(STATUS_PONTO) as StatusPonto[]).map(
  (valor) => ({ valor, rotulo: STATUS_PONTO[valor].rotulo }),
);

const colunas: ColumnDef<PontoLista, unknown>[] = [
  {
    accessorKey: "obraNome",
    header: "Obra",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium">{row.original.obraNome}</span>
        {row.original.obraLote ? (
          <span className="ml-1.5 text-legenda text-muted-foreground codigo-doc">
            Lote {row.original.obraLote}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.data)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_PONTO[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "encarregadoNome",
    header: "Encarregado",
    // Secundária, mas existe para o filtro de encarregado não filtrar por um
    // dado que a listagem nunca mostra.
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) => row.original.encarregadoNome ?? <CelulaVazia />,
  },
  // Largura acima do padrão do helper: "Colaboradores" é cabeçalho longo para
  // uma coluna de contagem, e truncar o título esconde do que é a coluna. 140
  // não bastava: o rótulo pede 99px e sobram 98 depois do padding e do ícone.
  colunaNumero<PontoLista>("qtdColaboradores", "Colaboradores", { size: 150 }),
  {
    accessorKey: "totalHoras",
    header: "Total de horas",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.totalHoras)} h
      </span>
    ),
  },
];

export interface PontosTabelaProps {
  pontos: PontoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  obraId: string;
  status: string;
  /** Início do período da data do ponto (yyyy-MM-dd) ou vazio. */
  de: string;
  /** Fim do período da data do ponto (yyyy-MM-dd) ou vazio. */
  ate: string;
  encarregadoId: string;
  obras: ObraOpcao[];
  colaboradores: ColaboradorOpcao[];
}

/**
 * Listagem dos pontos do dia: filtros na URL, aplicados no banco pela query
 * (a paginação é server-side, então filtrar em memória mentiria no total),
 * e clique na linha abre o detalhe. Todo filtro zera a página.
 */
export function PontosTabela({
  pontos,
  total,
  pagina,
  tamanho,
  obraId,
  status,
  de,
  ate,
  encarregadoId,
  obras,
  colaboradores,
}: PontosTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();

  const opcoesObra = obras.map((obra) => ({
    valor: obra.id,
    rotulo: obra.lote ? `${obra.nome} (Lote ${obra.lote})` : obra.nome,
  }));

  const opcoesColaborador = colaboradores.map((colaborador) => ({
    valor: colaborador.id,
    rotulo: colaborador.nome,
  }));

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        onLimparFiltros={limparTodos}
        idTabela="rh.apontamentos"
        columns={colunas}
        data={pontos}
        filtros={[
          {
            id: "obra",
            rotulo: "Obra",
            // Filtro principal da tela: ponto se trabalha por obra.
            fixo: true,
            elemento: (
              <FiltroSelect
                valor={obraId}
                onValorChange={(valor) =>
                  setMuitos({ obra: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={opcoesObra}
                placeholder="Obra"
                todosRotulo="Todas as obras"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "",
            onLimpar: () => setMuitos({ status: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={status}
                onValorChange={(valor) =>
                  setMuitos({ status: valor === "" ? null : valor, pagina: "1" })
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos os status"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período do ponto",
            ocultoPorPadrao: true,
            temValor: de !== "" || ate !== "",
            onLimpar: () => setMuitos({ de: null, ate: null, pagina: "1" }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({
                    de: novoDe === "" ? null : novoDe,
                    ate: novoAte === "" ? null : novoAte,
                    pagina: "1",
                  })
                }
              />
            ),
          },
          {
            id: "encarregado",
            rotulo: "Encarregado",
            ocultoPorPadrao: true,
            temValor: encarregadoId !== "",
            onLimpar: () => setMuitos({ encarregado: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={encarregadoId}
                onValorChange={(valor) =>
                  setMuitos({
                    encarregado: valor === "" ? null : valor,
                    pagina: "1",
                  })
                }
                opcoes={opcoesColaborador}
                placeholder="Encarregado"
                todosRotulo="Todos os encarregados"
                className="max-w-56"
              />
            ),
          },
        ]}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(ponto) => router.push(`/rh/apontamentos/${ponto.id}`)}
        emptyState={
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhum ponto lançado"
            descricao="Crie o ponto de um dia numa obra para começar a apontar as horas da equipe."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
