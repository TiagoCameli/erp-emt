"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, LoaderCircle, Pencil, Send, TriangleAlert, Undo2 } from "lucide-react";

import {
  ApprovalBar,
  comAvisoDeFalha,
  GradeKpis,
  KPICard,
  MoneyText,
  SecaoDetalhe,
  semDerrubarSucesso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { rotuloVinculo } from "@/modules/rh/decimo-terceiro/formato";
import { mensagemDeAprovacao } from "@/modules/rh/ferias/mensagem-aprovacao";
import {
  aprovarRecibo,
  desaprovarRecibo,
  enviarReciboParaAprovacao,
  rejeitarRecibo,
  voltarReciboParaRascunho,
} from "@/modules/rh/ferias/recibo-actions";
import { STATUS_RECIBO_INFO } from "@/modules/rh/ferias/recibo-formato";
import type { ReciboDetalhe as ReciboDetalheDados } from "@/modules/rh/ferias/recibo-queries";
import { ROTULO_STATUS_FERIAS } from "@/modules/rh/ferias/schemas";

import { EditarReciboDrawer } from "./editar-recibo-drawer";
import { VencimentoRecibo } from "./vencimento-recibo";

export interface ReciboDetalheProps {
  recibo: ReciboDetalheDados;
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
}

export function ReciboDetalhe({
  recibo,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
}: ReciboDetalheProps) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [copiandoPedido, setCopiandoPedido] = React.useState(false);

  // `sem_recibo` também é editável: digitar um valor é o que ABRE o recibo.
  const emRascunho =
    recibo.statusRecibo === "rascunho" || recibo.statusRecibo === "sem_recibo";
  const podeDigitar = podeEditar && emRascunho;
  const descontos = recibo.valorInss + recibo.valorIrrf;

  /** Depois do sucesso, nada pode virar falha: o dado já está gravado. */
  function atualizar() {
    semDerrubarSucesso("recibo-ferias.refresh", () => router.refresh());
  }

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
          id: recibo.id,
          colaboradorNome: recibo.colaboradorNome,
          dias: recibo.dias,
          dataInicio: recibo.dataInicio ?? "",
          dataFim: recibo.dataFim ?? "",
          valorLiquido: recibo.valorLiquido,
          dataVencimento: recibo.dataVencimento,
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

  const info = STATUS_RECIBO_INFO[recibo.statusRecibo];

  return (
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard
          titulo="Líquido a pagar"
          valor={<MoneyText valor={recibo.valorLiquido} />}
          detalhe={`${recibo.dias} ${recibo.dias === 1 ? "dia" : "dias"} de gozo`}
        />
        <KPICard
          titulo="Bruto"
          valor={<MoneyText valor={recibo.valorBruto} />}
          detalhe="O que foi digitado, antes dos descontos"
        />
        <KPICard
          titulo="Descontos"
          valor={<MoneyText valor={descontos} />}
          detalhe="INSS e IRRF digitados"
        />
      </GradeKpis>

      {recibo.statusRecibo === "sem_recibo" ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-status-pendente/40 bg-status-pendente/5 p-3 text-sm"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-status-pendente"
            aria-hidden
          />
          <span>
            <strong>Estas férias ainda não têm recibo.</strong> Elas foram
            cadastradas só como gozo. Digite o valor para abrir o recibo e
            poder mandar para aprovação.
          </span>
        </div>
      ) : null}

      {recibo.motivoRejeicao ? (
        <p className="rounded-md border border-border bg-surface p-3 text-sm">
          <span className="font-medium">Motivo da devolução: </span>
          <span className="text-muted-foreground">{recibo.motivoRejeicao}</span>
        </p>
      ) : null}

      {/*
        Antes da ApprovalBar de propósito: quem vai aprovar precisa ver para
        quando o dinheiro está programado ANTES de bater o martelo.
      */}
      <VencimentoRecibo
        feriasId={recibo.id}
        statusRecibo={recibo.statusRecibo}
        dataInicio={recibo.dataInicio}
        dataVencimento={recibo.dataVencimento}
        podeEditar={podeEditar}
      />

      <ApprovalBar
        status={recibo.statusRecibo}
        rotulo={info.rotulo}
        podeAprovar={podeAprovar}
        podeDesaprovar={podeDesaprovar}
        onAprovar={() =>
          comAvisoDeFalha("recibo-ferias.aprovar", async () => {
            const r = await aprovarRecibo(recibo.id);
            if ("erro" in r) {
              toast.error(r.erro);
              return;
            }
            toast.success("Recibo aprovado. A conta a pagar foi gerada.");
            atualizar();
          })
        }
        onRejeitar={(motivo) =>
          comAvisoDeFalha("recibo-ferias.rejeitar", async () => {
            const r = await rejeitarRecibo({ feriasId: recibo.id, motivo });
            if ("erro" in r) {
              toast.error(r.erro);
              return;
            }
            toast.success("Recibo devolvido para ajuste");
            atualizar();
          })
        }
        onDesaprovar={(motivo) =>
          comAvisoDeFalha("recibo-ferias.desaprovar", async () => {
            const r = await desaprovarRecibo({ feriasId: recibo.id, motivo });
            if ("erro" in r) {
              toast.error(r.erro);
              return;
            }
            toast.success("Recibo desaprovado. A conta a pagar foi apagada.");
            atualizar();
          })
        }
        textosRejeitar={{
          botao: "Devolver para ajuste",
          titulo: "Devolver o recibo para ajuste",
          descricao:
            "O recibo volta para rascunho e quem montou pode corrigir. Diga o que precisa mudar.",
          confirmar: "Devolver",
        }}
        acoesExtras={
          recibo.statusRecibo === "pendente_aprovacao" ? (
            // O que dá para fazer enquanto o recibo espera, do lado de quem
            // montou. Some quando é aprovado: aí o caminho de volta é
            // Desaprovar, que apaga o lançamento e exige motivo.
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
                    comAvisoDeFalha("recibo-ferias.voltar-rascunho", async () => {
                      const r = await voltarReciboParaRascunho(recibo.id);
                      if ("erro" in r) {
                        toast.error(r.erro);
                        return;
                      }
                      toast.success("Recibo de volta em rascunho");
                      atualizar();
                    })
                  }
                >
                  <Undo2 />
                  Voltar para rascunho
                </Button>
              ) : null}
            </>
          ) : podeDigitar ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditando(true)}
              >
                <Pencil />
                Digitar valores
              </Button>
              {/* Enviar só aparece com valor digitado: a RPC recusa recibo
                  zerado, e botão que só serve para mostrar erro é ruído. */}
              {recibo.statusRecibo === "rascunho" && recibo.valorLiquido > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    comAvisoDeFalha("recibo-ferias.enviar", async () => {
                      const r = await enviarReciboParaAprovacao(recibo.id);
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
              ) : null}
            </>
          ) : undefined
        }
      />

      <SecaoDetalhe titulo="Férias">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Colaborador</dt>
            <dd className="font-medium">{recibo.colaboradorNome}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vínculo</dt>
            <dd>{recibo.vinculo ? rotuloVinculo(recibo.vinculo) : "-"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Centro de custo</dt>
            <dd>{recibo.centroCustoNome ?? "Sem centro de custo"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Período aquisitivo</dt>
            <dd className="tabular-nums">
              {formatarData(recibo.periodoAquisitivoInicio)} a{" "}
              {formatarData(recibo.periodoAquisitivoFim)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Gozo</dt>
            <dd className="tabular-nums">
              {recibo.dataInicio
                ? `${formatarData(recibo.dataInicio)}${
                    recibo.dataFim ? ` a ${formatarData(recibo.dataFim)}` : ""
                  }`
                : "A programar"}
            </dd>
          </div>
          <div>
            {/* O status do GOZO, que é independente do status do recibo:
                alguém pode receber antes de sair de férias. */}
            <dt className="text-muted-foreground">Status do gozo</dt>
            <dd>{ROTULO_STATUS_FERIAS[recibo.status]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Salário do cadastro</dt>
            <dd className="tabular-nums">
              {recibo.salarioBase && recibo.salarioBase > 0 ? (
                <MoneyText valor={recibo.salarioBase} />
              ) : (
                <span className="text-muted-foreground">sem salário</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Admissão</dt>
            <dd className="tabular-nums">
              {recibo.dataAdmissao ? (
                formatarData(recibo.dataAdmissao)
              ) : (
                <span className="text-muted-foreground">não cadastrada</span>
              )}
            </dd>
          </div>
          {recibo.observacao ? (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-muted-foreground">Observação</dt>
              <dd>{recibo.observacao}</dd>
            </div>
          ) : null}
        </dl>
      </SecaoDetalhe>

      {podeDigitar ? (
        <EditarReciboDrawer
          recibo={editando ? recibo : null}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false);
            atualizar();
          }}
        />
      ) : null}
    </div>
  );
}
