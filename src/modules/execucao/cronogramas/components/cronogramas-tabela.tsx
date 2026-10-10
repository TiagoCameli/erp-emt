"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange } from "lucide-react";

import { DataTable, EmptyState, FiltroSelect, StatusBadge, useFiltrosUrl } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { ROTULO_STATUS_CRONOGRAMA, SELO_STATUS_CRONOGRAMA, STATUS_CRONOGRAMA } from "@/modules/execucao/_shared/rotulos";
import type { CronogramaLista } from "@/modules/execucao/cronogramas/queries";
import { NovoCronogramaDrawer, type CalendarioOpcao, type ObraOpcao } from "@/modules/execucao/obras/components/novo-cronograma-drawer";

const OPCOES_STATUS = STATUS_CRONOGRAMA.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_CRONOGRAMA[s] }));

export const colunasCronogramas: ColumnDef<CronogramaLista, unknown>[] = [
  { accessorKey: "obraNome", header: "Obra", size: 220 },
  { accessorKey: "codigo", header: "Código", size: 120, cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span> },
  { accessorKey: "nome", header: "Nome", size: 240 },
  {
    id: "situacao",
    header: "Situação",
    size: 120,
    cell: ({ row }) => (
      <StatusBadge status={SELO_STATUS_CRONOGRAMA[row.original.status] ?? row.original.status} rotulo={ROTULO_STATUS_CRONOGRAMA[row.original.status] ?? row.original.status} />
    ),
  },
  { id: "inicio", header: "Início previsto", size: 130, meta: { atomico: true }, cell: ({ row }) => formatarData(row.original.inicioPrevisto) },
  { id: "termino", header: "Término previsto", size: 130, meta: { atomico: true }, cell: ({ row }) => formatarData(row.original.terminoPrevisto) },
  { accessorKey: "nAtividades", header: "Atividades", size: 100, meta: { alinharDireita: true, atomico: true } },
  { accessorKey: "nCriticas", header: "Críticas", size: 90, meta: { alinharDireita: true, atomico: true } },
];

export interface CronogramasTabelaProps {
  cronogramas: CronogramaLista[];
  obraId: string;
  status: string;
  /** Obras que o usuário vê no módulo (pastas), para o filtro. */
  obrasFiltro: { id: string; nome: string }[];
  podeCriar: boolean;
  obras: ObraOpcao[];
  calendarios: CalendarioOpcao[];
}

/** Lista dos cronogramas de todas as obras em que o usuário está na lista de acesso. Filtros na URL. */
export function CronogramasTabela({ cronogramas, obraId, status, obrasFiltro, podeCriar, obras, calendarios }: CronogramasTabelaProps) {
  const router = useRouter();
  const { setMuitos, limparTodos } = useFiltrosUrl();
  const filtrado = obraId !== "" || status !== "";

  return (
    <DataTable<CronogramaLista>
      idTabela="execucao.cronogramas"
      columns={colunasCronogramas}
      data={cronogramas}
      idDaLinha={(c) => c.id}
      onRowClick={(c) => router.push(`/execucao/cronogramas/${c.id}`)}
      onLimparFiltros={limparTodos}
      filtros={[
        {
          id: "obra",
          rotulo: "Obra",
          fixo: true,
          temValor: obraId !== "",
          onLimpar: () => setMuitos({ obra: null }),
          elemento: (
            <FiltroSelect
              valor={obraId}
              onValorChange={(novo) => setMuitos({ obra: novo === "" ? null : novo })}
              opcoes={obrasFiltro.map((o) => ({ valor: o.id, rotulo: o.nome }))}
              todosRotulo="Todas as obras"
            />
          ),
        },
        {
          id: "status",
          rotulo: "Situação",
          fixo: true,
          temValor: status !== "",
          onLimpar: () => setMuitos({ status: null }),
          elemento: (
            <FiltroSelect
              valor={status}
              onValorChange={(novo) => setMuitos({ status: novo === "" ? null : novo })}
              opcoes={OPCOES_STATUS}
              todosRotulo="Todas as situações"
            />
          ),
        },
      ]}
      emptyState={
        <EmptyState
          icone={CalendarRange}
          titulo={filtrado ? "Nenhum cronograma com estes filtros" : "Nenhum cronograma ainda"}
          descricao={filtrado ? "Ajuste ou limpe os filtros" : "Você só vê os cronogramas das obras em que está na lista de acesso"}
          acao={!filtrado && podeCriar ? <NovoCronogramaDrawer obras={obras} calendarios={calendarios} /> : undefined}
          className="border-none bg-transparent"
        />
      }
    />
  );
}
