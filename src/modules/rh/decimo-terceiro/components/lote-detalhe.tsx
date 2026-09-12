"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Send, TriangleAlert } from "lucide-react";

import {
  ApprovalBar,
  comAvisoDeFalha,
  DataTable,
  GradeKpis,
  KPICard,
  MoneyText,
  SecaoDetalhe,
  semDerrubarSucesso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  aprovarLote,
  desaprovarLote,
  enviarParaAprovacao,
  rejeitarLote,
} from "@/modules/rh/decimo-terceiro/actions";
import {
  conferenciaDoLote,
  resumoPorCentroCusto,
} from "@/modules/rh/decimo-terceiro/calculo";
import {
  formatarPercentual,
  STATUS_LOTE_INFO,
} from "@/modules/rh/decimo-terceiro/formato";
import type {
  ForaDoLote,
  ItemDoLote,
  LoteDetalhe as LoteDetalheDados,
} from "@/modules/rh/decimo-terceiro/queries";

import { EditarItemDrawer } from "./editar-item-drawer";
import { ExcluidosDoLote } from "./excluidos-do-lote";

export interface LoteDetalheProps {
  lote: LoteDetalheDados;
  fora: ForaDoLote[];
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
}

export function LoteDetalhe({
  lote,
  fora,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
}: LoteDetalheProps) {
  const router = useRouter();
  const [emEdicao, setEmEdicao] = React.useState<ItemDoLote | null>(null);

  const conferencia = React.useMemo(() => conferenciaDoLote(lote), [lote]);
  const porCentro = React.useMemo(() => resumoPorCentroCusto(lote), [lote]);

  const emRascunho = lote.status === "rascunho";
  const podeEditarLinha = podeEditar && emRascunho;

  /** Depois do sucesso, nada pode virar falha: o dinheiro já está gravado. */
  function atualizar() {
    semDerrubarSucesso("13o.refresh", () => router.refresh());
  }

  const colunas = React.useMemo<ColumnDef<ItemDoLote, unknown>[]>(
    () => [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "centroCustoNome",
        header: "Centro de custo",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.centroCustoNome ?? "Sem centro de custo"}
          </span>
        ),
      },
      {
        accessorKey: "salarioBase",
        header: "Salário",
        meta: { alinharDireita: true, ocultaPorPadrao: true },
        cell: ({ row }) => <MoneyText valor={row.original.salarioBase} />,
      },
      {
        accessorKey: "avos",
        header: "Avos",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.avos}</span>
        ),
      },
      {
        accessorKey: "valorBruto",
        header: "Bruto",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valorBruto} />,
      },
      {
        accessorKey: "valorJaPago",
        header: "Já pago",
        meta: { alinharDireita: true, ocultaPorPadrao: lote.parcela === 1 },
        cell: ({ row }) => <MoneyText valor={row.original.valorJaPago} />,
      },
      {
        accessorKey: "valorInss",
        header: "INSS",
        meta: { alinharDireita: true, ocultaPorPadrao: !lote.comDesconto },
        cell: ({ row }) => <MoneyText valor={row.original.valorInss} />,
      },
      {
        accessorKey: "valorIrrf",
        header: "IRRF",
        meta: { alinharDireita: true, ocultaPorPadrao: !lote.comDesconto },
        cell: ({ row }) => <MoneyText valor={row.original.valorIrrf} />,
      },
      {
        accessorKey: "valorLiquido",
        header: "Líquido",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-1.5">
            <MoneyText valor={row.original.valorLiquido} />
            {row.original.editadoManualmente ? (
              <span
                title="Editado à mão"
                aria-label="Editado à mão"
                className="text-muted-foreground"
              >
                <Pencil className="size-3" aria-hidden />
              </span>
            ) : null}
          </span>
        ),
      },
    ],
    [lote.parcela, lote.comDesconto],
  );

  const info = STATUS_LOTE_INFO[lote.status];

  return (
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard
          titulo="Líquido a pagar"
          valor={<MoneyText valor={lote.valorLiquido} />}
          detalhe={`${lote.quantidadePessoas} ${
            lote.quantidadePessoas === 1 ? "colaborador" : "colaboradores"
          } · ${formatarPercentual(lote.percentual)} do 13º devido`}
        />
        <KPICard
          titulo="Bruto da parcela"
          valor={<MoneyText valor={lote.valorBruto} />}
          detalhe={
            lote.parcela === 2
              ? "Já descontado o que a 1ª parcela pagou"
              : "Antes de qualquer desconto"
          }
        />
        <KPICard
          titulo="Descontos"
          valor={<MoneyText valor={lote.valorDescontos} />}
          detalhe={
            lote.comDesconto
              ? "INSS e IRRF sobre o 13º inteiro do ano"
              : "Esta parcela sai sem desconto"
          }
        />
      </GradeKpis>

      {/* A soma dos itens contra o total gravado. Divergência aqui significa
          que o número do cabeçalho não é o que vai virar conta a pagar. */}
      {!conferencia.fecha ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            O total do lote não bate com a soma dos itens: diferença de{" "}
            <MoneyText valor={conferencia.diferenca} />. Não aprove sem conferir.
          </span>
        </div>
      ) : null}

      {lote.motivoRejeicao ? (
        <p className="rounded-md border border-border bg-surface p-3 text-sm">
          <span className="font-medium">Motivo da devolução: </span>
          <span className="text-muted-foreground">{lote.motivoRejeicao}</span>
        </p>
      ) : null}

      <ExcluidosDoLote fora={fora} />

      <ApprovalBar
        status={lote.status}
        rotulo={info.rotulo}
        podeAprovar={podeAprovar}
        podeDesaprovar={podeDesaprovar}
        onAprovar={() =>
          comAvisoDeFalha("13o.aprovar", async () => {
            const r = await aprovarLote(lote.id);
            if ("erro" in r) {
              toast.error(r.erro);
              return;
            }
            toast.success("13º aprovado. As contas a pagar foram geradas.");
            atualizar();
          })
        }
        onRejeitar={(motivo) =>
          comAvisoDeFalha("13o.rejeitar", async () => {
            const r = await rejeitarLote({ loteId: lote.id, motivo });
            if ("erro" in r) {
              toast.error(r.erro);
              return;
            }
            toast.success("13º devolvido para ajuste");
            atualizar();
          })
        }
        onDesaprovar={(motivo) =>
          comAvisoDeFalha("13o.desaprovar", async () => {
            const r = await desaprovarLote({ loteId: lote.id, motivo });
            if ("erro" in r) {
              toast.error(r.erro);
              return;
            }
            toast.success("13º desaprovado. As contas a pagar foram apagadas.");
            atualizar();
          })
        }
        textosRejeitar={{
          botao: "Devolver para ajuste",
          titulo: "Devolver o 13º para ajuste",
          descricao:
            "O lote volta para rascunho e quem gerou pode corrigir. Diga o que precisa mudar.",
          confirmar: "Devolver",
        }}
        acoesExtras={
          emRascunho && podeEditar ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                comAvisoDeFalha("13o.enviar", async () => {
                  const r = await enviarParaAprovacao(lote.id);
                  if ("erro" in r) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success("Enviado para aprovação");
                  atualizar();
                })
              }
            >
              <Send />
              Enviar para aprovação
            </Button>
          ) : undefined
        }
      />

      <SecaoDetalhe
        titulo="Itens"
        acao={
          conferencia.editadosAMao > 0 ? (
            <span className="text-sm text-muted-foreground">
              {conferencia.editadosAMao}{" "}
              {conferencia.editadosAMao === 1
                ? "linha editada à mão"
                : "linhas editadas à mão"}
            </span>
          ) : undefined
        }
      >
        <DataTable
          idTabela="rh.decimo-terceiro.itens"
          columns={colunas}
          data={lote.itens}
          onRowClick={
            podeEditarLinha ? (item) => setEmEdicao(item) : undefined
          }
        />
      </SecaoDetalhe>

      {porCentro.length > 1 ? (
        <SecaoDetalhe titulo="Por centro de custo">
          <ul className="flex flex-col gap-1 text-sm">
            {porCentro.map((linha) => (
              <li
                key={linha.centroCustoId ?? "__sem_centro__"}
                className="flex items-center justify-between gap-4 border-b border-border py-1 last:border-none"
              >
                <span>{linha.centroCustoNome}</span>
                <MoneyText valor={linha.valorLiquido} />
              </li>
            ))}
          </ul>
        </SecaoDetalhe>
      ) : null}

      {podeEditarLinha ? (
        <EditarItemDrawer
          item={emEdicao}
          onFechar={() => {
            setEmEdicao(null);
            atualizar();
          }}
        />
      ) : null}
    </div>
  );
}
