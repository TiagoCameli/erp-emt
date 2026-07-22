"use client";

import * as React from "react";
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { AnexosRegistro } from "@/modules/compras/_shared/anexos";
import { infoStatusCotacao } from "@/modules/compras/_shared/formato";
import { SecaoDetalhe } from "@/modules/compras/_shared/secao-detalhe";
import {
  cancelarCotacao,
  removerFornecedor,
} from "@/modules/compras/cotacoes/actions";
import type {
  CondicaoPagamentoOpcao,
  CotacaoDetalhe as CotacaoDetalheData,
  FornecedorOpcao,
  InsumoOpcao,
} from "@/modules/compras/cotacoes/queries";
import { FinalizarCotacaoDialog } from "./finalizar-cotacao-dialog";
import { FornecedorCotacaoDrawer } from "./fornecedor-cotacao-drawer";
import { MapaComparativo } from "./mapa-comparativo";

export interface CotacaoDetalheProps {
  cotacao: CotacaoDetalheData;
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  trilha: EventoTrilha[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  podeEditar: boolean;
}

/**
 * Detalhe da cotação: cabeçalho com status, lista de fornecedores
 * (adicionar/remover com a cotação aberta), mapa comparativo, finalização com
 * escolha do vencedor, anexos e trilha de auditoria.
 */
export function CotacaoDetalhe({
  cotacao,
  fornecedores,
  insumos,
  trilha,
  condicoesPagamento,
  podeEditar,
}: CotacaoDetalheProps) {
  const editavel = podeEditar && cotacao.status === "aberta";
  const info = infoStatusCotacao(cotacao.status);

  const [drawerFornecedor, setDrawerFornecedor] = React.useState(false);
  const [finalizarAberto, setFinalizarAberto] = React.useState(false);
  const [cancelarAberto, setCancelarAberto] = React.useState(false);
  const [removendo, setRemovendo] = React.useState<{
    id: string;
    nome: string;
  } | null>(null);

  const fornecedoresUsados = cotacao.fornecedores.map(
    (fornecedor) => fornecedor.fornecedorId,
  );

  async function confirmarRemocao() {
    if (!removendo) return;
    const resultado = await removerFornecedor(removendo.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Fornecedor removido");
    setRemovendo(null);
  }

  async function confirmarCancelamento(motivo?: string) {
    const resultado = await cancelarCotacao(cotacao.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Cotação cancelada");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="codigo-doc text-corpo font-semibold">
              {cotacao.numero ?? "Cotação"}
            </span>
            <StatusBadge status={info.badge} rotulo={info.rotulo} />
          </div>
          <p className="text-detalhe text-muted-foreground">
            Criada em {formatarData(cotacao.createdAt)}
          </p>
        </div>

        {editavel ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancelarAberto(true)}
            >
              <XCircle />
              Cancelar cotação
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setFinalizarAberto(true)}
            >
              <CheckCircle2 />
              Finalizar e escolher vencedor
            </Button>
          </div>
        ) : null}
      </div>

      {cotacao.observacoes ? (
        <p className="text-detalhe text-muted-foreground">
          {cotacao.observacoes}
        </p>
      ) : null}

      {cotacao.status === "finalizada" && cotacao.vencedorNome ? (
        <div className="rounded-md border border-border bg-surface px-4 py-3">
          <p className="text-detalhe font-medium">
            Vencedor: {cotacao.vencedorNome}
          </p>
          {cotacao.motivoSelecao ? (
            <p className="text-detalhe text-muted-foreground">
              Motivo: {cotacao.motivoSelecao}
            </p>
          ) : null}
        </div>
      ) : null}

      {cotacao.status === "cancelada" && cotacao.motivoSelecao ? (
        <div className="rounded-md border border-border bg-surface px-4 py-3">
          <p className="text-detalhe text-muted-foreground">
            Motivo do cancelamento: {cotacao.motivoSelecao}
          </p>
        </div>
      ) : null}

      <SecaoDetalhe
        titulo="Fornecedores"
        acao={
          editavel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerFornecedor(true)}
            >
              <Plus />
              Adicionar fornecedor
            </Button>
          ) : undefined
        }
      >
        {cotacao.fornecedores.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Nenhum fornecedor na cotação
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {cotacao.fornecedores.map((fornecedor) => (
              <li
                key={fornecedor.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5",
                  fornecedor.id === cotacao.vencedorFornecedorId &&
                    "border-status-aprovado",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-detalhe font-medium">
                    {fornecedor.fornecedorNome}
                    {fornecedor.id === cotacao.vencedorFornecedorId ? (
                      <span className="ml-2 text-legenda text-status-aprovado">
                        Vencedor
                      </span>
                    ) : null}
                  </p>
                  <p className="text-legenda text-muted-foreground">
                    {[
                      fornecedor.condicaoPagamentoDescricao,
                      fornecedor.prazoEntregaDias !== null
                        ? `${fornecedor.prazoEntregaDias} dias`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sem condições informadas"}
                  </p>
                  <p className="mt-1 text-legenda text-muted-foreground">
                    Total{" "}
                    <MoneyText
                      valor={fornecedor.total}
                      className={cn(
                        "inline",
                        fornecedor.menorTotal && "text-status-aprovado",
                      )}
                    />
                  </p>
                </div>
                {editavel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover ${fornecedor.fornecedorNome}`}
                    onClick={() =>
                      setRemovendo({
                        id: fornecedor.id,
                        nome: fornecedor.fornecedorNome,
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SecaoDetalhe>

      <SecaoDetalhe titulo="Mapa comparativo">
        <MapaComparativo
          cotacao={cotacao}
          insumos={insumos}
          podeEditar={podeEditar}
        />
      </SecaoDetalhe>

      <SecaoDetalhe titulo="Anexos">
        <AnexosRegistro
          tabela="cotacoes"
          registroId={cotacao.id}
          podeEditar={podeEditar}
        />
      </SecaoDetalhe>

      <SecaoDetalhe titulo="Trilha">
        <Trilha eventos={trilha} />
      </SecaoDetalhe>

      {editavel ? (
        <FornecedorCotacaoDrawer
          aberto={drawerFornecedor}
          onAbertoChange={setDrawerFornecedor}
          cotacaoId={cotacao.id}
          fornecedores={fornecedores}
          fornecedoresUsados={fornecedoresUsados}
          condicoesPagamento={condicoesPagamento}
        />
      ) : null}

      <FinalizarCotacaoDialog
        key={finalizarAberto ? "aberto" : "fechado"}
        aberto={finalizarAberto}
        onAbertoChange={setFinalizarAberto}
        cotacaoId={cotacao.id}
        fornecedores={cotacao.fornecedores}
      />

      <ConfirmDialog
        aberto={cancelarAberto}
        onAbertoChange={setCancelarAberto}
        titulo="Cancelar cotação"
        descricao="A cotação fica cancelada e não pode mais ser alterada."
        textoConfirmar="Cancelar cotação"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={confirmarCancelamento}
      />

      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRemovendo(null);
        }}
        titulo="Remover fornecedor"
        descricao={
          removendo
            ? `${removendo.nome} sai da cotação e os preços dele são apagados.`
            : ""
        }
        textoConfirmar="Remover fornecedor"
        variante="destrutivo"
        onConfirmar={confirmarRemocao}
      />
    </div>
  );
}
