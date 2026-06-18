"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Pencil, Send } from "lucide-react";
import { toast } from "sonner";

import {
  ApprovalBar,
  ConfirmDialog,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData, formatarDataHora, formatarQuantidade } from "@/lib/formatadores";
import { AnexosRegistro } from "@/modules/compras/_shared/anexos";
import { ROTULO_STATUS_PEDIDO } from "@/modules/compras/_shared/formato";
import {
  aprovarPedido,
  cancelarPedido,
  desaprovarPedido,
  enviarParaAprovacao,
  rejeitarPedido,
} from "@/modules/compras/pedidos/actions";
import type {
  InsumoOpcao,
  OpcaoSelecao,
  PedidoDetalhe as PedidoDetalheDados,
} from "@/modules/compras/pedidos/queries";
import { PedidoFormDrawer } from "./pedido-form-drawer";

export interface PedidoDetalheProps {
  pedido: PedidoDetalheDados;
  eventos: EventoTrilha[];
  insumos: InsumoOpcao[];
  centrosCusto: OpcaoSelecao[];
  depositos: OpcaoSelecao[];
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
}

/** Bloco de rótulo + valor para o resumo do pedido. */
function CampoResumo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

/**
 * Detalhe de um pedido: resumo, ApprovalBar quando pendente ou aprovado, lista
 * de itens, anexos e trilha de auditoria. As ações de fluxo (enviar, editar,
 * cancelar, aprovar, rejeitar, desaprovar) respeitam status e permissão.
 */
export function PedidoDetalhe({
  pedido,
  eventos,
  insumos,
  centrosCusto,
  depositos,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
}: PedidoDetalheProps) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [cancelando, setCancelando] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  const info = ROTULO_STATUS_PEDIDO[pedido.status];

  const podeEnviar = pedido.status === "rascunho" && podeEditar;
  const podeAbrirEdicao =
    podeEditar &&
    (pedido.status === "rascunho" || pedido.status === "pendente_aprovacao");
  const podeCancelar =
    podeEditar &&
    pedido.status !== "cancelado" &&
    pedido.status !== "aprovado";
  const mostrarApprovalBar =
    (pedido.status === "pendente_aprovacao" && podeAprovar) ||
    (pedido.status === "aprovado" && podeDesaprovar);

  async function aoEnviar() {
    if (enviando) return;
    setEnviando(true);
    try {
      const resultado = await enviarParaAprovacao(pedido.id);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Pedido enviado para aprovação");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  async function aoAprovar() {
    const resultado = await aprovarPedido(pedido.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pedido aprovado");
    router.refresh();
  }

  async function aoRejeitar(motivo: string) {
    const resultado = await rejeitarPedido(pedido.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pedido rejeitado");
    router.refresh();
  }

  async function aoDesaprovar(motivo: string) {
    const resultado = await desaprovarPedido(pedido.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pedido desaprovado, voltou para pendente");
    router.refresh();
  }

  async function aoCancelar(motivo?: string) {
    const resultado = await cancelarPedido(pedido.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pedido cancelado");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Voltar para a lista de pedidos"
            onClick={() => router.push("/compras/pedidos")}
          >
            <ArrowLeft />
          </Button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="codigo-doc text-titulo font-semibold">
                {pedido.numero ?? "Pedido"}
              </h1>
              <StatusBadge status={info.badge} rotulo={info.rotulo} />
            </div>
            <p className="text-detalhe text-muted-foreground">
              Criado em {formatarData(pedido.criadoEm)}
              {pedido.solicitanteNome ? ` por ${pedido.solicitanteNome}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {podeEnviar ? (
            <Button type="button" disabled={enviando} onClick={aoEnviar}>
              <Send />
              {enviando ? "Enviando..." : "Enviar para aprovação"}
            </Button>
          ) : null}
          {podeAbrirEdicao ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditando(true)}
            >
              <Pencil />
              Editar
            </Button>
          ) : null}
          {podeCancelar ? (
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelando(true)}
            >
              <Ban />
              Cancelar pedido
            </Button>
          ) : null}
        </div>
      </div>

      {mostrarApprovalBar ? (
        <ApprovalBar
          status={pedido.status}
          podeAprovar={podeAprovar}
          podeDesaprovar={podeDesaprovar}
          onAprovar={aoAprovar}
          onRejeitar={aoRejeitar}
          onDesaprovar={aoDesaprovar}
        />
      ) : null}

      {pedido.justificativa ? (
        <CampoResumo rotulo="Justificativa">{pedido.justificativa}</CampoResumo>
      ) : null}

      {pedido.status === "rejeitado" && pedido.motivoRejeicao ? (
        <div className="rounded-md border border-status-rejeitado/30 bg-status-rejeitado/5 px-4 py-3">
          <CampoResumo rotulo="Motivo da rejeição">
            {pedido.motivoRejeicao}
          </CampoResumo>
        </div>
      ) : null}

      {pedido.status === "aprovado" && pedido.aprovadoPorNome ? (
        <CampoResumo rotulo="Aprovação">
          {pedido.aprovadoPorNome}
          {pedido.aprovadoEm ? ` · ${formatarDataHora(pedido.aprovadoEm)}` : ""}
        </CampoResumo>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-secao font-semibold">Itens</h2>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Insumo
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Quantidade
                </TableHead>
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Centro de custo
                </TableHead>
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Depósito
                </TableHead>
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Observação
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedido.itens.map((item) => (
                <TableRow key={item.id} className="h-9 hover:bg-transparent">
                  <TableCell className="px-3 text-detalhe font-medium">
                    {item.insumoNome}
                  </TableCell>
                  <TableCell className="px-3 text-right text-detalhe tabular-nums">
                    {formatarQuantidade(item.quantidade)}
                    {item.insumoUnidade ? ` ${item.insumoUnidade}` : ""}
                  </TableCell>
                  <TableCell className="px-3 text-detalhe">
                    {item.centroCustoNome}
                  </TableCell>
                  <TableCell className="px-3 text-detalhe">
                    {item.depositoNome ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 text-detalhe">
                    {item.observacao ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-secao font-semibold">Anexos</h2>
        <AnexosRegistro
          tabela="pedidos"
          registroId={pedido.id}
          podeEditar={podeEditar}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-secao font-semibold">Trilha</h2>
        <Trilha eventos={eventos} />
      </section>

      {podeAbrirEdicao ? (
        <PedidoFormDrawer
          key={editando ? "editando" : "fechado"}
          aberto={editando}
          onAbertoChange={setEditando}
          pedido={pedido}
          insumos={insumos}
          centrosCusto={centrosCusto}
          depositos={depositos}
        />
      ) : null}

      <ConfirmDialog
        aberto={cancelando}
        onAbertoChange={setCancelando}
        titulo="Cancelar pedido"
        descricao="O pedido fica registrado como cancelado. Informe o motivo, ele entra na auditoria."
        textoConfirmar="Cancelar pedido"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoCancelar}
      />
    </div>
  );
}
