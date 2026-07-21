"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Pencil } from "lucide-react";
import { toast } from "sonner";

import {
  ApprovalBar,
  ConfirmDialog,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarQuantidade } from "@/lib/formatadores";
import { AnexosRegistro } from "@/modules/compras/_shared/anexos";
import { infoStatusOC } from "@/modules/compras/_shared/formato";
import { SecaoDetalhe } from "@/modules/compras/_shared/secao-detalhe";
import {
  aprovarOrdem,
  cancelarOrdem,
  desaprovarOrdem,
  enviarParaAprovacao,
  rejeitarOrdem,
} from "@/modules/compras/ordens/actions";
import type {
  CentroCustoOpcao,
  CotacaoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  OrdemDetalhe,
} from "@/modules/compras/ordens/queries";
import { OrdemFormDrawer } from "./ordem-form-drawer";

/** Rótulo e cor do status do lançamento financeiro vinculado. */
const STATUS_LANCAMENTO: Record<string, { rotulo: string; classes: string }> = {
  previsto: {
    rotulo: "Previsto",
    classes: "bg-status-rascunho/10 text-status-rascunho",
  },
  a_pagar: {
    rotulo: "A pagar",
    classes: "bg-status-pendente/10 text-status-pendente",
  },
  pago: { rotulo: "Pago", classes: "bg-status-efeito/10 text-status-efeito" },
  cancelado: {
    rotulo: "Cancelado",
    classes: "bg-status-rejeitado/10 text-status-rejeitado",
  },
};

function infoLancamento(status: string): { rotulo: string; classes: string } {
  return (
    STATUS_LANCAMENTO[status] ?? {
      rotulo: status,
      classes: "bg-status-rascunho/10 text-status-rascunho",
    }
  );
}

/** Linha rotulada para os dados do cabeçalho. */
function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}


export interface OrdemDetalheViewProps {
  ordem: OrdemDetalhe;
  trilha: EventoTrilha[];
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  cotacoes: CotacaoOpcao[];
  condicoesPagamento: string[];
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
}

/**
 * Detalhe da OC: cabeçalho com ApprovalBar, bloco do lançamento financeiro,
 * itens, anexos e trilha. As ações de status passam pelas Server Actions,
 * que por sua vez chamam as RPCs e repassam o erro do banco ao toast.
 */
export function OrdemDetalheView({
  ordem,
  trilha,
  fornecedores,
  insumos,
  centrosCusto,
  cotacoes,
  condicoesPagamento,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
}: OrdemDetalheViewProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [dialogCancelar, setDialogCancelar] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  const info = infoStatusOC(ordem.status);
  const editavel =
    podeEditar &&
    (ordem.status === "rascunho" || ordem.status === "pendente_aprovacao");
  const cancelavel =
    podeEditar &&
    (ordem.status === "rascunho" ||
      ordem.status === "pendente_aprovacao" ||
      ordem.status === "rejeitado");

  async function aoEnviarParaAprovacao() {
    if (enviando) return;
    setEnviando(true);
    try {
      const resultado = await enviarParaAprovacao(ordem.id);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Ordem enviada para aprovação");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  async function aoAprovar() {
    const resultado = await aprovarOrdem(ordem.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem aprovada. O lançamento previsto foi gerado");
    router.refresh();
  }

  async function aoRejeitar(motivo: string) {
    const resultado = await rejeitarOrdem(ordem.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem rejeitada");
    router.refresh();
  }

  async function aoDesaprovar(motivo: string) {
    const resultado = await desaprovarOrdem(ordem.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem desaprovada. O lançamento previsto foi cancelado");
    router.refresh();
  }

  async function aoCancelar(motivo?: string) {
    const resultado = await cancelarOrdem(ordem.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem cancelada");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista"
            onClick={() => router.push("/compras/ordens")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold">
                <span className="codigo-doc">{ordem.numero ?? "Sem número"}</span>
              </h1>
              <StatusBadge status={info.badge} rotulo={info.rotulo} />
            </div>
            <p className="text-detalhe text-muted-foreground">
              {ordem.fornecedorNome}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editavel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerAberto(true)}
            >
              <Pencil />
              Editar
            </Button>
          ) : null}
          {ordem.status === "rascunho" && podeEditar ? (
            <Button
              type="button"
              size="sm"
              disabled={enviando}
              onClick={aoEnviarParaAprovacao}
            >
              {enviando ? "Enviando..." : "Enviar para aprovação"}
            </Button>
          ) : null}
          {cancelavel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDialogCancelar(true)}
            >
              <Ban />
              Cancelar ordem
            </Button>
          ) : null}
        </div>
      </div>

      <ApprovalBar
        status={ordem.status}
        podeAprovar={podeAprovar}
        podeDesaprovar={podeDesaprovar}
        onAprovar={aoAprovar}
        onRejeitar={aoRejeitar}
        onDesaprovar={aoDesaprovar}
      />

      {ordem.motivoRejeicao ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-legenda font-medium text-destructive">
            Motivo do registro
          </p>
          <p className="text-detalhe text-foreground">{ordem.motivoRejeicao}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SecaoDetalhe card titulo="Dados da ordem">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Fornecedor">{ordem.fornecedorNome}</Dado>
              <Dado rotulo="Emissão">{formatarData(ordem.dataEmissao)}</Dado>
              <Dado rotulo="Condição de pagamento">
                {ordem.condicaoPagamento ?? "-"}
              </Dado>
              <Dado rotulo="Cotação de origem">
                {ordem.cotacaoNumero ? (
                  <span className="codigo-doc">{ordem.cotacaoNumero}</span>
                ) : (
                  "-"
                )}
              </Dado>
              <Dado rotulo="Valor total">
                <MoneyText valor={ordem.valorTotal} className="font-semibold" />
              </Dado>
            </div>
            {ordem.observacoes ? (
              <div className="mt-4">
                <Dado rotulo="Observações">{ordem.observacoes}</Dado>
              </div>
            ) : null}
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Lançamento financeiro">
            {ordem.lancamento ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status="rascunho"
                    rotulo={infoLancamento(ordem.lancamento.status).rotulo}
                    className={infoLancamento(ordem.lancamento.status).classes}
                  />
                  <span className="text-legenda text-muted-foreground">
                    Vence em{" "}
                    {ordem.lancamento.dataVencimento
                      ? formatarData(ordem.lancamento.dataVencimento)
                      : "-"}
                  </span>
                </div>
                <MoneyText
                  valor={ordem.lancamento.valor}
                  className="font-semibold"
                />
              </div>
            ) : (
              <p className="text-detalhe text-muted-foreground">
                Nenhum lançamento ainda. A aprovação da ordem gera o lançamento
                previsto.
              </p>
            )}
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Itens">
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Insumo</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Centro de custo
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                    <th className="px-3 py-2 text-right font-medium">Preço</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {ordem.itens.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        {item.insumoNome}
                        {item.unidade ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({item.unidade})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{item.centroCustoNome}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarQuantidade(item.quantidade)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarBRL(item.precoUnitario)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarBRL(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="px-3 py-2" colSpan={4}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarBRL(ordem.valorTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Anexos">
            <AnexosRegistro
              tabela="ordens_compra"
              registroId={ordem.id}
              podeEditar={podeEditar}
            />
          </SecaoDetalhe>
        </div>

        <div className="lg:col-span-1">
          <SecaoDetalhe card titulo="Trilha">
            <Trilha eventos={trilha} />
          </SecaoDetalhe>
        </div>
      </div>

      {editavel ? (
        <OrdemFormDrawer
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) router.refresh();
          }}
          ordem={ordem}
          fornecedores={fornecedores}
          insumos={insumos}
          centrosCusto={centrosCusto}
          cotacoes={cotacoes}
          condicoesPagamento={condicoesPagamento}
        />
      ) : null}

      <ConfirmDialog
        aberto={dialogCancelar}
        onAbertoChange={setDialogCancelar}
        titulo="Cancelar ordem de compra"
        descricao="Informe o motivo do cancelamento. Ele fica registrado na auditoria."
        textoConfirmar="Cancelar ordem"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoCancelar}
      />
    </div>
  );
}
