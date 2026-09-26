"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Copy,
  LoaderCircle,
  Pencil,
  Plus,
  Send,
  TriangleAlert,
  Undo2,
  UserMinus,
} from "lucide-react";

import {
  ApprovalBar,
  comAvisoDeFalha,
  ConfirmDialog,
  DataTable,
  GradeKpis,
  KPICard,
  MoneyText,
  SecaoDetalhe,
  semDerrubarSucesso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import {
  aprovarLote,
  desaprovarLote,
  enviarParaAprovacao,
  rejeitarLote,
  tirarDoLote,
  voltarParaRascunho,
} from "@/modules/rh/decimo-terceiro/actions";
import { mensagemDeAprovacao } from "@/modules/rh/decimo-terceiro/mensagem-aprovacao";
import {
  conferenciaDoLote,
  resumoPorCentroCusto,
} from "@/modules/rh/decimo-terceiro/calculo";
import {
  rotuloVinculo,
  STATUS_LOTE_INFO,
} from "@/modules/rh/decimo-terceiro/formato";
import type {
  ColaboradorParaAdicionar,
  ItemDoLote,
  LoteDetalhe as LoteDetalheDados,
} from "@/modules/rh/decimo-terceiro/queries";

import { AdicionarColaboradorDrawer } from "./adicionar-colaborador-drawer";
import { EditarItemDrawer } from "./editar-item-drawer";
import { VencimentoLote } from "./vencimento-lote";

export interface LoteDetalheProps {
  lote: LoteDetalheDados;
  paraAdicionar: ColaboradorParaAdicionar[];
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
}

export function LoteDetalhe({
  lote,
  paraAdicionar,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
}: LoteDetalheProps) {
  const router = useRouter();
  const [emEdicao, setEmEdicao] = React.useState<ItemDoLote | null>(null);
  const [paraTirar, setParaTirar] = React.useState<ItemDoLote | null>(null);
  const [adicionarAberto, setAdicionarAberto] = React.useState(false);
  const [copiandoPedido, setCopiandoPedido] = React.useState(false);

  const porCentro = React.useMemo(() => resumoPorCentroCusto(lote), [lote]);
  const conferencia = React.useMemo(() => conferenciaDoLote(lote), [lote]);

  const emRascunho = lote.status === "rascunho";
  const podeEditarLinha = podeEditar && emRascunho;

  /** Depois do sucesso, nada pode virar falha: o dado já está gravado. */
  function atualizar() {
    semDerrubarSucesso("13o.refresh", () => router.refresh());
  }

  const preenchidos = lote.itens.filter((item) => item.valorLiquido > 0).length;

  /**
   * Copia o pedido de aprovação para o WhatsApp.
   *
   * A mensagem carrega os números, e não só o link: quem recebe precisa saber
   * o tamanho do que está sendo pedido antes de clicar. E avisa quando a área
   * de transferência falha — botão que parece ter funcionado e não funcionou é
   * pior que botão que não existe.
   */
  async function aoCopiarPedido() {
    if (copiandoPedido) return;
    setCopiandoPedido(true);
    try {
      const texto = mensagemDeAprovacao(
        {
          id: lote.id,
          ano: lote.ano,
          parcela: lote.parcela,
          pessoas: lote.itens.length,
          preenchidos,
          valorLiquido: lote.valorLiquido,
          dataVencimento: lote.dataVencimento,
        },
        window.location.origin,
      );

      try {
        await navigator.clipboard.writeText(texto);
      } catch {
        // `writeText` falha sem permissão de área de transferência (navegador
        // antigo, http, aba sem foco).
        toast.error(
          "Não foi possível copiar. Verifique a permissão de área de transferência do navegador",
        );
        return;
      }

      toast.success("Pedido copiado. Cole no WhatsApp de quem aprova");
    } finally {
      setCopiandoPedido(false);
    }
  }
  const emBranco = lote.itens.length - preenchidos;

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
        accessorKey: "vinculo",
        header: "Vínculo",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {rotuloVinculo(row.original.vinculo)}
          </span>
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
      // Contexto para decidir o valor, NÃO base de cálculo: o app não calcula.
      {
        accessorKey: "salarioBase",
        header: "Salário",
        meta: { alinharDireita: true },
        cell: ({ row }) =>
          row.original.salarioBase > 0 ? (
            <span className="text-muted-foreground">
              <MoneyText valor={row.original.salarioBase} />
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "dataAdmissao",
        header: "Admissão",
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {row.original.dataAdmissao
              ? formatarData(row.original.dataAdmissao)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "valorBruto",
        header: "Bruto",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valorBruto} />,
      },
      {
        accessorKey: "valorInss",
        header: "INSS",
        meta: { alinharDireita: true, ocultaPorPadrao: true },
        cell: ({ row }) => <MoneyText valor={row.original.valorInss} />,
      },
      {
        accessorKey: "valorIrrf",
        header: "IRRF",
        meta: { alinharDireita: true, ocultaPorPadrao: true },
        cell: ({ row }) => <MoneyText valor={row.original.valorIrrf} />,
      },
      {
        accessorKey: "valorLiquido",
        header: "Líquido",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-1.5">
            <MoneyText valor={row.original.valorLiquido} />
            {row.original.editadoManualmente ? null : (
              <span
                title="Ainda não preenchido"
                aria-label="Ainda não preenchido"
                className="text-status-pendente"
              >
                ·
              </span>
            )}
          </span>
        ),
      },
      {
        id: "acoes",
        header: "",
        cell: ({ row }) =>
          podeEditarLinha ? (
            // O botão fica na linha de propósito: `<tr>` não vira botão
            // acessível, e é este o caminho que funciona por teclado e leitor
            // de tela. O clique na linha é atalho de mouse, não a única porta.
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEmEdicao(row.original)}
              >
                <Pencil />
                Editar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setParaTirar(row.original)}
              >
                <UserMinus />
                <span className="sr-only">Tirar do lote</span>
              </Button>
            </div>
          ) : null,
      },
    ],
    [podeEditarLinha],
  );

  const info = STATUS_LOTE_INFO[lote.status];

  return (
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard
          titulo="Líquido a pagar"
          valor={<MoneyText valor={lote.valorLiquido} />}
          detalhe={`${preenchidos} de ${lote.itens.length} ${
            lote.itens.length === 1 ? "linha preenchida" : "linhas preenchidas"
          }`}
        />
        <KPICard
          titulo="Bruto"
          valor={<MoneyText valor={lote.valorBruto} />}
          detalhe="Soma do que foi digitado, antes dos descontos"
        />
        <KPICard
          titulo="Descontos"
          valor={<MoneyText valor={lote.valorDescontos} />}
          detalhe="INSS e IRRF digitados nas linhas"
        />
      </GradeKpis>

      {/* A soma dos itens contra o total gravado no cabeçalho. Divergência
          significa que fn_dt_recalcular_totais não rodou depois de alguma
          edição, e aí o número da tela não é o que vai virar conta a pagar. */}
      {!conferencia.fecha ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            O total do lote não bate com a soma das linhas: diferença de{" "}
            <MoneyText valor={conferencia.diferenca} />. Não aprove sem conferir.
          </span>
        </div>
      ) : null}

      {emRascunho && emBranco > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-status-pendente"
            aria-hidden
          />
          <span>
            <strong>
              {emBranco}{" "}
              {emBranco === 1 ? "linha ainda em branco" : "linhas ainda em branco"}
            </strong>
            . Quem ficar em R$ 0,00 não vira conta a pagar na aprovação. Se a
            pessoa não recebe 13º, pode tirar do lote.
          </span>
        </div>
      ) : null}

      {lote.motivoRejeicao ? (
        <p className="rounded-md border border-border bg-surface p-3 text-sm">
          <span className="font-medium">Motivo da devolução: </span>
          <span className="text-muted-foreground">{lote.motivoRejeicao}</span>
        </p>
      ) : null}

      {/*
        Antes da ApprovalBar de propósito: quem vai aprovar precisa ver para
        quando o dinheiro está programado ANTES de bater o martelo.
      */}
      <VencimentoLote
        loteId={lote.id}
        ano={lote.ano}
        status={lote.status}
        dataVencimento={lote.dataVencimento}
        podeEditar={podeEditar}
      />

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
            "O lote volta para rascunho e quem montou pode corrigir. Diga o que precisa mudar.",
          confirmar: "Devolver",
        }}
        acoesExtras={
          lote.status === "pendente_aprovacao" ? (
            // O que dá para fazer enquanto o lote espera, do lado de quem
            // montou. Some quando é aprovado: aí o caminho de volta é
            // Desaprovar, que apaga lançamento e exige motivo.
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={copiandoPedido}
                onClick={aoCopiarPedido}
              >
                {copiandoPedido ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Copy />
                )}
                Copiar pedido
              </Button>
              {podeEditar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    comAvisoDeFalha("13o.voltar-rascunho", async () => {
                      const r = await voltarParaRascunho(lote.id);
                      if ("erro" in r) {
                        toast.error(r.erro);
                        return;
                      }
                      toast.success("Lote de volta em rascunho");
                      atualizar();
                    })
                  }
                >
                  <Undo2 />
                  Voltar para rascunho
                </Button>
              ) : null}
            </>
          ) : emRascunho && podeEditar ? (
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
          podeEditarLinha ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdicionarAberto(true)}
            >
              <Plus />
              Acrescentar colaborador
            </Button>
          ) : undefined
        }
      >
        <DataTable
          idTabela="rh.decimo-terceiro.itens"
          columns={colunas}
          data={lote.itens}
          onRowClick={podeEditarLinha ? (item) => setEmEdicao(item) : undefined}
        />
      </SecaoDetalhe>

      {porCentro.length > 1 ? (
        <SecaoDetalhe titulo="Por centro de custo">
          <ul className="flex flex-col gap-1 text-sm">
            {porCentro
              .filter((linha) => linha.valorLiquido > 0)
              .map((linha) => (
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
        <>
          <EditarItemDrawer
            item={emEdicao}
            onFechar={() => setEmEdicao(null)}
            onSalvo={() => {
              setEmEdicao(null);
              atualizar();
            }}
          />

          <AdicionarColaboradorDrawer
            aberto={adicionarAberto}
            onAbertoChange={setAdicionarAberto}
            loteId={lote.id}
            colaboradores={paraAdicionar}
            onAdicionado={atualizar}
          />

          <ConfirmDialog
            aberto={paraTirar !== null}
            onAbertoChange={(aberto) => {
              if (!aberto) setParaTirar(null);
            }}
            titulo="Tirar do lote"
            descricao={
              paraTirar
                ? `${paraTirar.colaboradorNome} sai deste lote de 13º. O cadastro não é tocado, e dá para acrescentar de volta.`
                : ""
            }
            textoConfirmar="Tirar do lote"
            variante="destrutivo"
            onConfirmar={() =>
              comAvisoDeFalha("13o.tirar", async () => {
                if (!paraTirar) return;
                const r = await tirarDoLote({ itemId: paraTirar.id });
                if ("erro" in r) {
                  toast.error(r.erro);
                  return;
                }
                toast.success(`${paraTirar.colaboradorNome} saiu do lote`);
                setParaTirar(null);
                atualizar();
              })
            }
          />
        </>
      ) : null}
    </div>
  );
}
