"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatarDataHoraRioBranco } from "@/modules/combustivel/_shared/rotulos";
import { conferirAnomalia } from "@/modules/combustivel/anomalias/actions";
import { ROTULO_SEVERIDADE, type SeveridadeAnomalia } from "@/modules/combustivel/anomalias/detect";
import { linkDaSaida } from "@/modules/combustivel/anomalias/links";
import type { AnomaliaLista } from "@/modules/combustivel/anomalias/queries";
import { MAXIMO_MOTIVO, type Situacao } from "@/modules/combustivel/anomalias/schemas";

/** Severidade no selo canônico: crítica no vermelho, atenção no âmbar, informativa no cinza. */
const STATUS_DA_SEVERIDADE: Record<SeveridadeAnomalia, string> = {
  critica: "rejeitado",
  atencao: "pendente_aprovacao",
  info: "rascunho",
};

const OPCOES_SITUACAO = [
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "conferidas", rotulo: "Conferidas" },
];

export interface AnomaliasTabelaProps {
  anomalias: AnomaliaLista[];
  situacao: Situacao;
  /** Período (yyyy-MM-dd) já resolvido pela página, com o padrão aplicado. */
  de: string;
  ate: string;
  podeEditar: boolean;
  /** A pessoa abre a tela de abastecimentos? Sem isso o link seria para um 404. */
  veAbastecimentos: boolean;
}

/**
 * Lista das anomalias detectadas no período. A detecção roda no servidor e chega
 * pronta; aqui só se filtra a situação (a lista inteira já está na mão).
 */
export function AnomaliasTabela({ anomalias, situacao, de, ate, podeEditar, veAbastecimentos }: AnomaliasTabelaProps) {
  const { setMuitos } = useFiltrosUrl();
  const [conferindo, setConferindo] = React.useState<AnomaliaLista | null>(null);
  const [desmarcando, setDesmarcando] = React.useState<AnomaliaLista | null>(null);
  const [motivo, setMotivo] = React.useState("");

  const visiveis = React.useMemo(() => {
    if (situacao === "conferidas") return anomalias.filter((a) => a.conferencia !== null);
    if (situacao === "pendentes") return anomalias.filter((a) => a.conferencia === null);
    return anomalias;
  }, [anomalias, situacao]);

  async function aoConfirmarConferencia() {
    if (!conferindo) return;
    const resultado = await conferirAnomalia({ chave: conferindo.id, conferida: true, motivo });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anomalia marcada como conferida");
    setConferindo(null);
  }

  async function aoConfirmarDesmarcar() {
    if (!desmarcando) return;
    const resultado = await conferirAnomalia({ chave: desmarcando.id, conferida: false });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anomalia voltou para pendentes");
    setDesmarcando(null);
  }

  const colunas = React.useMemo<ColumnDef<AnomaliaLista, unknown>[]>(() => {
    const base: ColumnDef<AnomaliaLista, unknown>[] = [
      {
        accessorKey: "severidade",
        header: "Severidade",
        size: 120,
        cell: ({ row }) => (
          <StatusBadge
            status={STATUS_DA_SEVERIDADE[row.original.severidade]}
            rotulo={ROTULO_SEVERIDADE[row.original.severidade]}
          />
        ),
      },
      {
        accessorKey: "rotuloRegra",
        header: "Anomalia",
        size: 210,
        cell: ({ row }) => <span className="font-medium">{row.original.rotuloRegra}</span>,
      },
      {
        accessorKey: "data",
        header: "Data",
        size: 140,
        cell: ({ row }) =>
          row.original.data ? (
            <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.data)}</span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        accessorKey: "equipamentoRotulo",
        header: "Equipamento",
        size: 220,
        cell: ({ row }) => row.original.equipamentoRotulo ?? <CelulaVazia />,
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        size: 420,
        cell: ({ row }) => <span className="whitespace-normal">{row.original.descricao}</span>,
      },
      {
        id: "saidas",
        header: "Abastecimento",
        size: 150,
        cell: ({ row }) => {
          const ids = row.original.saidaIds;
          if (ids.length === 0) return <CelulaVazia />;
          if (!veAbastecimentos) return <span className="tabular-nums">{ids.length}</span>;
          return (
            <span className="flex flex-wrap gap-x-2">
              {ids.map((id, indice) => (
                <Link key={id} href={linkDaSaida(id)} className="font-medium hover:underline">
                  {ids.length === 1 ? "Abrir" : `Abrir ${indice + 1}`}
                </Link>
              ))}
            </span>
          );
        },
      },
      {
        id: "situacao",
        header: "Situação",
        size: 150,
        cell: ({ row }) => {
          const conferencia = row.original.conferencia;
          if (!conferencia) return <StatusBadge status="pendente_aprovacao" rotulo="Pendente" />;
          const detalhe = [`Conferida em ${formatarDataHoraRioBranco(conferencia.conferidoEm)}`, conferencia.motivo]
            .filter(Boolean)
            .join(". ");
          return (
            <span title={detalhe}>
              <StatusBadge status="aprovado" rotulo="Conferida" />
            </span>
          );
        },
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 190,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) =>
        row.original.conferencia ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDesmarcando(row.original)}>
            Desmarcar
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setMotivo("");
              setConferindo(row.original);
            }}
          >
            Marcar como conferida
          </Button>
        ),
    });
    return base;
  }, [podeEditar, veAbastecimentos]);

  return (
    <>
      <DataTable
        // Limpa só os filtros DESTA lista: a de sem suprimento, na mesma página, tem o dela.
        onLimparFiltros={() => setMuitos({ de: null, ate: null, situacao: null })}
        idTabela="combustivel.anomalias"
        columns={colunas}
        data={visiveis}
        filtros={[
          {
            id: "periodo",
            rotulo: "Período",
            fixo: true,
            temValor: true,
            onLimpar: () => setMuitos({ de: null, ate: null }),
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                rotulo="Data do abastecimento"
                onPeriodoChange={(novoDe, novoAte) =>
                  setMuitos({ de: novoDe === "" ? null : novoDe, ate: novoAte === "" ? null : novoAte })
                }
              />
            ),
          },
          {
            id: "situacao",
            rotulo: "Situação",
            fixo: true,
            temValor: situacao !== "pendentes",
            onLimpar: () => setMuitos({ situacao: null }),
            elemento: (
              <FiltroSelect
                valor={situacao === "todas" ? "" : situacao}
                // "Todas" é o vazio do filtro; o padrão da tela (sem parâmetro) é "pendentes".
                onValorChange={(valor) => setMuitos({ situacao: valor === "" ? "todas" : valor === "pendentes" ? null : valor })}
                opcoes={OPCOES_SITUACAO}
                todosRotulo="Todas"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={ShieldCheck}
            titulo={situacao === "conferidas" ? "Nenhuma anomalia conferida no período" : "Nenhuma anomalia pendente no período"}
            descricao="Amplie o período ou troque a situação para ver as outras"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <>
          <ConfirmDialog
            aberto={conferindo !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setConferindo(null);
            }}
            titulo="Marcar como conferida"
            descricao={conferindo?.descricao ?? ""}
            textoConfirmar="Marcar como conferida"
            conteudo={
              <div className="grid gap-2">
                <Label htmlFor="motivo-conferencia">O que foi conferido (opcional)</Label>
                <Textarea
                  id="motivo-conferencia"
                  value={motivo}
                  maxLength={MAXIMO_MOTIVO}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Ex.: o operador confirmou o abastecimento"
                  rows={3}
                />
              </div>
            }
            onConfirmar={aoConfirmarConferencia}
          />
          <ConfirmDialog
            aberto={desmarcando !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setDesmarcando(null);
            }}
            titulo="Desmarcar conferência"
            descricao="A anomalia volta para a lista de pendentes."
            textoConfirmar="Desmarcar"
            onConfirmar={aoConfirmarDesmarcar}
          />
        </>
      ) : null}
    </>
  );
}
