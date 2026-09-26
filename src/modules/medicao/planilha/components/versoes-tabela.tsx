"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, FileSpreadsheet, Upload } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, FilterBar, FiltroSelect, MoneyText, StatusBadge, useFiltrosUrl } from "@/components/canonicos";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import type { VersaoLista } from "@/modules/medicao/planilha/queries";
import { ROTULO_STATUS_VERSAO } from "@/modules/medicao/_shared/rotulos";

/** Selo da versão: vigente usa o verde de "aprovado"; rascunho, o cinza. */
export function SeloVersao({ status }: { status: string }) {
  return status === "vigente" ? (
    <StatusBadge status="aprovado" rotulo={ROTULO_STATUS_VERSAO.vigente} />
  ) : (
    <StatusBadge status="rascunho" rotulo={ROTULO_STATUS_VERSAO[status as keyof typeof ROTULO_STATUS_VERSAO] ?? status} />
  );
}

/** Texto do valor previsto: sem regra de arredondamento o banco devolve nulo, e a tela diz por quê. */
export function ValorPrevisto({ valor }: { valor: number | null }) {
  return valor === null ? (
    <span className="text-muted-foreground">Sem regra de arredondamento</span>
  ) : (
    <MoneyText valor={valor} />
  );
}

/** Escolha do contrato, por `?contrato=` na URL. Lista só os contratos da lista de acesso (RLS). */
export function SeletorContrato({ contratos, contratoId }: { contratos: { id: string; codigo: string; nomeObra: string }[]; contratoId: string }) {
  const { setMuitos } = useFiltrosUrl();
  return (
    <FilterBar>
      <FiltroSelect
        valor={contratoId}
        onValorChange={(novo) => setMuitos({ contrato: novo === "" ? null : novo })}
        opcoes={contratos.map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nomeObra}` }))}
        todosRotulo="Escolha o contrato"
        className="max-w-80"
      />
    </FilterBar>
  );
}

const colunas: ColumnDef<VersaoLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Versão",
    size: 90,
    meta: { fixa: true },
    cell: ({ row }) => <span className="font-mono">v{row.original.numero}</span>,
  },
  {
    id: "aditivo",
    header: "Aditivo",
    size: 140,
    cell: ({ row }) =>
      row.original.numero === 0 ? (
        <span className="text-muted-foreground">Licitada</span>
      ) : row.original.aditivoNumero !== null ? (
        `Aditivo nº ${row.original.aditivoNumero}`
      ) : (
        <CelulaVazia />
      ),
  },
  {
    accessorKey: "vigenteDesde",
    header: "Vigente desde",
    size: 130,
    meta: { atomico: true },
    cell: ({ row }) => formatarData(row.original.vigenteDesde),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 120,
    cell: ({ row }) => <SeloVersao status={row.original.status} />,
  },
  {
    id: "previsto",
    header: "Previsto",
    size: 200,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <ValorPrevisto valor={row.original.totalPrevisto} />,
  },
  {
    accessorKey: "arquivoNome",
    header: "Arquivo",
    size: 240,
    cell: ({ row }) => row.original.arquivoNome ?? <span className="text-muted-foreground">Ainda não importado</span>,
  },
];

export interface VersoesTabelaProps {
  versoes: VersaoLista[];
  podeCriar: boolean;
}

/** Versões da planilha do contrato. A v0 é a licitada; cada aditivo vira uma versão nova. */
export function VersoesTabela({ versoes, podeCriar }: VersoesTabelaProps) {
  const router = useRouter();
  return (
    <DataTable
      idTabela="medicao.planilha.versoes"
      columns={colunas}
      data={versoes}
      onRowClick={(v) => router.push(`/medicao/planilha/${v.id}`)}
      acoesLinha={(v) => (
        <>
          <DropdownMenuItem onSelect={() => router.push(`/medicao/planilha/${v.id}`)}>
            <ExternalLink />
            Abrir versão
          </DropdownMenuItem>
          {podeCriar && v.status === "rascunho" ? (
            <DropdownMenuItem onSelect={() => router.push(`/medicao/planilha/${v.id}/importar`)}>
              <Upload />
              Importar planilha
            </DropdownMenuItem>
          ) : null}
        </>
      )}
      emptyState={
        <EmptyState
          icone={FileSpreadsheet}
          titulo="Nenhuma versão da planilha"
          descricao={
            podeCriar
              ? "Comece pela v0, a planilha licitada, pelo botão do cabeçalho"
              : "Quem tem permissão de importar começa pela v0, a planilha licitada"
          }
          className="border-none bg-transparent"
        />
      }
    />
  );
}
