"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, History, Loader2, Trash2 } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, MoneyText, StatusBadge } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { urlDoAnexo } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { ExcluirRelatorio } from "@/modules/medicao/reajuste/components/excluir-relatorio";
import { SeloSituacaoReajuste } from "@/modules/medicao/reajuste/components/selo-situacao-reajuste";
import { diferencaReajuste, rotuloOrigemReajuste } from "@/modules/medicao/reajuste/formato";
import type { RelatorioResumo, ReajusteVigente } from "@/modules/medicao/reajuste/tipos";

export interface HistoricoReajusteProps {
  medicaoId: string;
  /** Todos os relatórios da medição, inclusive os excluídos, na ordem da sequência. */
  relatorios: RelatorioResumo[];
  /** O que vale (`mc_v_reajuste_medicao`): só ele tem a diferença para o anterior. */
  vigente: ReajusteVigente | null;
  /** Anexos `mc_reajuste` da medição: o vínculo de cada PDF, para abrir por `urlDoAnexo`. */
  anexos: AnexoDoDocumento[];
  /** `medicao.reajuste/editar`, lido no servidor: libera o Excluir. */
  podeEditar: boolean;
  onExcluido: () => void;
}

function BotaoPdf({ vinculoId, nome }: { vinculoId: string; nome: string }) {
  const [abrindo, setAbrindo] = React.useState(false);
  async function abrir() {
    setAbrindo(true);
    try {
      const r = await urlDoAnexo(vinculoId);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      window.open(r.url, "_blank", "noopener,noreferrer");
    } finally {
      setAbrindo(false);
    }
  }
  return (
    <Button type="button" variant="link" size="sm" className="h-auto max-w-full p-0" aria-label={`Abrir ${nome}`} disabled={abrindo} onClick={abrir}>
      {abrindo ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
      <span className="truncate">{nome}</span>
    </Button>
  );
}

/**
 * Histórico dos relatórios de reajuste da medição: nº, origem, situação, total, quando, quem, o PDF
 * (aberto pelo vínculo do anexo) e, nos excluídos, o total riscado e o motivo. A diferença para o
 * anterior vem pronta do banco (`mc_v_reajuste_medicao`) e só existe no relatório que vale: nas
 * outras linhas fica vazia, porque o módulo não soma nem subtrai dinheiro (D7).
 */
export function HistoricoReajuste({ medicaoId, relatorios, vigente, anexos, podeEditar, onExcluido }: HistoricoReajusteProps) {
  const [excluindo, setExcluindo] = React.useState<RelatorioResumo | null>(null);
  const vinculoPorArquivo = React.useMemo(() => new Map(anexos.map((a) => [a.arquivoId, a.vinculoId])), [anexos]);
  const vigenteId = vigente?.relatorioId ?? null;
  const diferencaVigente = vigente?.diferenca ?? null;

  const colunas = React.useMemo<ColumnDef<RelatorioResumo, unknown>[]>(() => {
    const base: ColumnDef<RelatorioResumo, unknown>[] = [
      {
        accessorKey: "sequencia",
        header: "Nº",
        size: 60,
        meta: { fixa: true, atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{row.original.sequencia}</span>,
      },
      {
        accessorKey: "origem",
        header: "Origem",
        size: 90,
        meta: { atomico: true },
        cell: ({ row }) => rotuloOrigemReajuste(row.original.origem),
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        size: 190,
        meta: { celular: "destaque" },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-wrap items-center gap-1">
              <SeloSituacaoReajuste situacao={r.situacao} />
              {r.excluidoEm ? <StatusBadge status="cancelado" rotulo="Excluído" discreto /> : null}
              {r.id === vigenteId ? <StatusBadge status="aprovado" rotulo="Vale" discreto /> : null}
            </div>
          );
        },
      },
      {
        accessorKey: "total",
        header: "Total",
        size: 140,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <MoneyText valor={row.original.total} className={cn(row.original.excluidoEm && "text-muted-foreground line-through")} />,
      },
      {
        id: "diferenca",
        header: "Diferença para o anterior",
        size: 190,
        meta: { alinharDireita: true, atomico: true, celular: "destaque" },
        cell: ({ row }) => {
          if (row.original.id !== vigenteId || diferencaVigente === null) return null;
          const d = diferencaReajuste(diferencaVigente);
          return <span className={cn("tabular-nums", d.sinal < 0 && "text-status-rejeitado")}>{d.texto}</span>;
        },
      },
      {
        accessorKey: "criadoEm",
        header: "Quando",
        size: 140,
        meta: { atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{formatarDataHora(row.original.criadoEm)}</span>,
      },
      {
        id: "quem",
        header: "Quem",
        size: 140,
        cell: ({ row }) => row.original.criadoPorNome ?? <CelulaVazia />,
      },
      {
        id: "pdf",
        header: "PDF",
        size: 200,
        cell: ({ row }) => {
          const r = row.original;
          if (!r.arquivoId) return <CelulaVazia />;
          const vinculo = vinculoPorArquivo.get(r.arquivoId);
          const nome = r.arquivoNome ?? "PDF";
          return vinculo ? <BotaoPdf vinculoId={vinculo} nome={nome} /> : <span className="text-muted-foreground">{nome}</span>;
        },
      },
      {
        id: "exclusao",
        header: "Exclusão",
        size: 260,
        meta: { celular: "destaque" },
        cell: ({ row }) => {
          const r = row.original;
          if (!r.excluidoEm) return null;
          return (
            <span className="text-detalhe">
              {r.motivoExclusao}
              <span className="text-muted-foreground">
                {` · ${r.excluidoPorNome ? `${r.excluidoPorNome}, ` : ""}${formatarDataHora(r.excluidoEm)}`}
              </span>
            </span>
          );
        },
      },
    ];
    if (!podeEditar) return base;
    return [
      ...base,
      {
        // "acoes": o card do celular reconhece esta coluna como a das ações e põe no canto dele.
        id: "acoes",
        header: () => <span className="sr-only">Ações</span>,
        size: 110,
        meta: { alinharDireita: true, atomico: true },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.excluidoEm ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Excluir relatório ${row.original.sequencia}`}
              onClick={() => setExcluindo(row.original)}
            >
              <Trash2 aria-hidden />
              Excluir
            </Button>
          ),
      },
    ];
  }, [podeEditar, vigenteId, diferencaVigente, vinculoPorArquivo]);

  return (
    <>
      <DataTable
        idTabela="medicao.reajuste.historico"
        columns={colunas}
        data={relatorios}
        idDaLinha={(r) => r.id}
        emptyState={
          <EmptyState icone={History} titulo="Nenhum relatório de reajuste" className="border-none bg-transparent" />
        }
      />
      <ExcluirRelatorio
        relatorio={excluindo}
        medicaoId={medicaoId}
        onFechar={() => setExcluindo(null)}
        onExcluido={() => {
          setExcluindo(null);
          onExcluido();
        }}
      />
    </>
  );
}
