"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Fuel } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroSelect,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { revisarSemSuprimento } from "@/modules/combustivel/anomalias/actions";
import { linkDaSaida } from "@/modules/combustivel/anomalias/links";
import type { SemSuprimentoLista } from "@/modules/combustivel/anomalias/queries";
import { MAXIMO_MOTIVO, type Situacao } from "@/modules/combustivel/anomalias/schemas";

const OPCOES_REVISAO = [
  { valor: "pendentes", rotulo: "Não revisadas" },
  { valor: "conferidas", rotulo: "Revisadas" },
];

export interface SemSuprimentoTabelaProps {
  linhas: SemSuprimentoLista[];
  /** "conferidas" aqui quer dizer revisadas: o mesmo filtro, outro nome na tela. */
  revisao: Situacao;
  podeEditar: boolean;
  veAbastecimentos: boolean;
}

/**
 * Saídas que pediram mais litros do que o tanque tinha na data. A saída passou
 * (como na origem), e a falta fica aqui até alguém revisar: em geral é entrada
 * lançada atrasada ou com data errada.
 */
export function SemSuprimentoTabela({ linhas, revisao, podeEditar, veAbastecimentos }: SemSuprimentoTabelaProps) {
  const { setMuitos } = useFiltrosUrl();
  const [revisando, setRevisando] = React.useState<SemSuprimentoLista | null>(null);
  const [desfazendo, setDesfazendo] = React.useState<SemSuprimentoLista | null>(null);
  const [observacao, setObservacao] = React.useState("");

  const visiveis = React.useMemo(() => {
    if (revisao === "conferidas") return linhas.filter((l) => l.revisao !== null);
    if (revisao === "pendentes") return linhas.filter((l) => l.revisao === null);
    return linhas;
  }, [linhas, revisao]);

  async function aoConfirmarRevisao() {
    if (!revisando) return;
    const resultado = await revisarSemSuprimento({ saidaId: revisando.saidaId, revisado: true, observacao });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Saída marcada como revisada");
    setRevisando(null);
  }

  async function aoConfirmarDesfazer() {
    if (!desfazendo) return;
    const resultado = await revisarSemSuprimento({ saidaId: desfazendo.saidaId, revisado: false });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Revisão desfeita");
    setDesfazendo(null);
  }

  const colunas = React.useMemo<ColumnDef<SemSuprimentoLista, unknown>[]>(() => {
    const litros = (valor: number) => <span className="tabular-nums">{formatarLitros(valor)}</span>;
    const base: ColumnDef<SemSuprimentoLista, unknown>[] = [
      {
        accessorKey: "dataSaida",
        header: "Data",
        size: 140,
        cell: ({ row }) => <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.dataSaida)}</span>,
      },
      {
        accessorKey: "tanqueNome",
        header: "Tanque",
        size: 180,
        cell: ({ row }) => <span className="font-medium">{row.original.tanqueNome}</span>,
      },
      { accessorKey: "consumidor", header: "Consumidor", size: 240 },
      {
        accessorKey: "litrosSolicitados",
        header: "Solicitados",
        size: 120,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => litros(row.original.litrosSolicitados),
      },
      {
        accessorKey: "litrosSupridos",
        header: "Supridos",
        size: 120,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => litros(row.original.litrosSupridos),
      },
      {
        accessorKey: "litrosSemSuprimento",
        header: "Faltaram",
        size: 120,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <span className="font-medium">{litros(row.original.litrosSemSuprimento)}</span>,
      },
      {
        id: "saida",
        header: "Abastecimento",
        size: 120,
        cell: ({ row }) =>
          veAbastecimentos ? (
            <Link href={linkDaSaida(row.original.saidaId)} className="font-medium hover:underline">
              Abrir
            </Link>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        id: "revisao",
        header: "Revisão",
        size: 150,
        cell: ({ row }) => {
          const r = row.original.revisao;
          if (!r) return <StatusBadge status="pendente_aprovacao" rotulo="Não revisada" />;
          const detalhe = [`Revisada em ${formatarDataHoraRioBranco(r.revisadoEm)}`, r.observacao].filter(Boolean).join(". ");
          return (
            <span title={detalhe}>
              <StatusBadge status="aprovado" rotulo="Revisada" />
            </span>
          );
        },
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 160,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) =>
        row.original.revisao ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDesfazendo(row.original)}>
            Desfazer
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setObservacao("");
              setRevisando(row.original);
            }}
          >
            Marcar revisado
          </Button>
        ),
    });
    return base;
  }, [podeEditar, veAbastecimentos]);

  return (
    <>
      <DataTable
        // Limpa só o filtro DESTA lista: a de anomalias, na mesma página, tem os dela.
        onLimparFiltros={() => setMuitos({ revisao: null })}
        idTabela="combustivel.sem-suprimento"
        columns={colunas}
        data={visiveis}
        filtros={[
          {
            id: "revisao",
            rotulo: "Revisão",
            fixo: true,
            temValor: revisao !== "pendentes",
            onLimpar: () => setMuitos({ revisao: null }),
            elemento: (
              <FiltroSelect
                valor={revisao === "todas" ? "" : revisao}
                onValorChange={(valor) => setMuitos({ revisao: valor === "" ? "todas" : valor === "pendentes" ? null : valor })}
                opcoes={OPCOES_REVISAO}
                todosRotulo="Todas"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Fuel}
            titulo={revisao === "conferidas" ? "Nenhuma saída revisada" : "Nenhuma saída sem suprimento para revisar"}
            descricao="Aparece aqui a saída que pediu mais litros do que o tanque tinha na data"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <>
          <ConfirmDialog
            aberto={revisando !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setRevisando(null);
            }}
            titulo="Marcar como revisado"
            descricao={
              revisando
                ? `Faltaram ${formatarLitros(revisando.litrosSemSuprimento)} no tanque ${revisando.tanqueNome} em ${formatarDataHoraRioBranco(revisando.dataSaida)}.`
                : ""
            }
            textoConfirmar="Marcar revisado"
            conteudo={
              <div className="grid gap-2">
                <Label htmlFor="observacao-revisao">Observação (opcional)</Label>
                <Textarea
                  id="observacao-revisao"
                  value={observacao}
                  maxLength={MAXIMO_MOTIVO}
                  onChange={(evento) => setObservacao(evento.target.value)}
                  placeholder="Ex.: a entrada foi lançada com data errada"
                  rows={3}
                />
              </div>
            }
            onConfirmar={aoConfirmarRevisao}
          />
          <ConfirmDialog
            aberto={desfazendo !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setDesfazendo(null);
            }}
            titulo="Desfazer revisão"
            descricao="A saída volta para a lista de não revisadas."
            textoConfirmar="Desfazer revisão"
            onConfirmar={aoConfirmarDesfazer}
          />
        </>
      ) : null}
    </>
  );
}
