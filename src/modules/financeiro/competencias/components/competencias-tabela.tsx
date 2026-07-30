"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarCheck, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  fecharCompetencia,
  reabrirCompetencia,
} from "@/modules/financeiro/competencias/actions";
import type { CompetenciaMes } from "@/modules/financeiro/competencias/queries";

export interface CompetenciasTabelaProps {
  competencias: CompetenciaMes[];
  podeFechar: boolean;
  podeReabrir: boolean;
}

/**
 * Fechamento de competência: um mês por linha, com o custo que está sendo
 * congelado e quantos lançamentos ainda estão incompletos (custo que vai mudar
 * depois). Fechar pede confirmação mostrando o valor; reabrir exige motivo,
 * porque muda número que alguém já olhou.
 */
export function CompetenciasTabela({
  competencias,
  podeFechar,
  podeReabrir,
}: CompetenciasTabelaProps) {
  const router = useRouter();
  const [fechando, setFechando] = React.useState<CompetenciaMes | null>(null);
  const [reabrindo, setReabrindo] = React.useState<CompetenciaMes | null>(null);

  async function aoFechar(mes: CompetenciaMes) {
    const resultado = await fecharCompetencia(mes.mes);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Competência ${formatarMesAno(mes.mes)} fechada`);
    router.refresh();
  }

  async function aoReabrir(mes: CompetenciaMes, motivo: string) {
    const resultado = await reabrirCompetencia(mes.mes, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Competência ${formatarMesAno(mes.mes)} reaberta`);
    router.refresh();
  }

  const colunas = React.useMemo<ColumnDef<CompetenciaMes, unknown>[]>(() => {
    const base: ColumnDef<CompetenciaMes, unknown>[] = [
      {
        accessorKey: "mes",
        header: "Mês de referência",
        size: 150,
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatarMesAno(row.original.mes)}
          </span>
        ),
      },
      {
        accessorKey: "fechada",
        header: "Situação",
        size: 130,
        cell: ({ row }) =>
          row.original.fechada ? (
            <StatusBadge status="aprovado" rotulo="Fechada" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Aberta" />
          ),
      },
      {
        accessorKey: "custo",
        header: "Custo do mês",
        size: 150,
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.custo} />,
      },
      {
        accessorKey: "lancamentos",
        header: "Lançamentos",
        size: 120,
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.lancamentos}</span>
        ),
      },
      {
        accessorKey: "incompletos",
        header: "Incompletos",
        size: 140,
        meta: { alinharDireita: true, naoTruncar: true },
        cell: ({ row }) =>
          row.original.incompletos > 0 ? (
            <StatusBadge
              status="rejeitado"
              rotulo={`${row.original.incompletos} incompleto${
                row.original.incompletos > 1 ? "s" : ""
              }`}
            />
          ) : (
            <span className="tabular-nums text-muted-foreground">0</span>
          ),
      },
      {
        id: "excecoes",
        header: "Exceções",
        size: 150,
        meta: { alinharDireita: true, naoTruncar: true },
        cell: ({ row }) =>
          row.original.excecoes > 0 || row.original.reaberturas > 0 ? (
            // Mês fechado que recebeu lançamento ou foi reaberto: o custo dele
            // mudou depois do fechamento, e isso não pode ficar escondido.
            <StatusBadge
              status="pendente_aprovacao"
              rotulo={[
                row.original.excecoes > 0
                  ? `${row.original.excecoes} exceção${row.original.excecoes > 1 ? "es" : ""}`
                  : null,
                row.original.reaberturas > 0
                  ? `${row.original.reaberturas} reabertura${row.original.reaberturas > 1 ? "s" : ""}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "fechamento",
        header: "Fechada por",
        size: 220,
        cell: ({ row }) =>
          row.original.fechada ? (
            <span className="text-legenda text-muted-foreground">
              {row.original.fechadoPorNome ?? "-"}
              {row.original.fechadoEm
                ? ` · ${formatarData(row.original.fechadoEm)}`
                : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ];

    if (!podeFechar && !podeReabrir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 130,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações", naoTruncar: true },
      cell: ({ row }) => {
        const mes = row.original;
        if (mes.fechada) {
          return podeReabrir ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReabrindo(mes)}
            >
              <LockOpen />
              Reabrir
            </Button>
          ) : null;
        }
        return podeFechar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFechando(mes)}
          >
            <Lock />
            Fechar
          </Button>
        ) : null;
      },
    });

    return base;
  }, [podeFechar, podeReabrir]);

  return (
    <>
      <DataTable
        idTabela="financeiro.competencias"
        columns={colunas}
        data={competencias}
        emptyState={
          <EmptyState
            icone={CalendarCheck}
            titulo="Nenhum mês para mostrar"
            descricao="Os meses aparecem aqui conforme houver lançamentos."
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={fechando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setFechando(null);
        }}
        titulo={`Fechar ${fechando ? formatarMesAno(fechando.mes) : ""}`}
        descricao={
          fechando
            ? `Vai congelar ${formatarBRL(fechando.custo)} de custo em ${
                fechando.lancamentos
              } lançamento(s).${
                fechando.incompletos > 0
                  ? ` Atenção: ${fechando.incompletos} lançamento(s) deste mês ainda estão incompletos, e o custo deles vai entrar depois pela exceção.`
                  : ""
              } Depois de fechar, lançar neste mês exige reabrir a competência.`
            : ""
        }
        textoConfirmar="Fechar competência"
        onConfirmar={async () => {
          if (fechando) await aoFechar(fechando);
          setFechando(null);
        }}
      />

      <ConfirmDialog
        aberto={reabrindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setReabrindo(null);
        }}
        titulo={`Reabrir ${reabrindo ? formatarMesAno(reabrindo.mes) : ""}`}
        descricao="Reabrir permite lançar de novo neste mês, o que muda o custo já apurado. Informe o motivo: ele fica registrado na auditoria."
        textoConfirmar="Reabrir competência"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={async (motivo) => {
          if (reabrindo) await aoReabrir(reabrindo, motivo ?? "");
          setReabrindo(null);
        }}
      />
    </>
  );
}
