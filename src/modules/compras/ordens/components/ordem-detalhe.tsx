"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Pencil, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Anexos } from "@/components/canonicos/anexos";
import { AlterarMesDialog } from "@/modules/_shared/alterar-mes-dialog";
import {
  ApprovalBar,
  ConfirmDialog,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  formatarBRL,
  formatarData,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { infoStatusOC } from "@/modules/compras/_shared/formato";
import { SecaoDetalhe } from "@/modules/compras/_shared/secao-detalhe";
import {
  aprovarOrdem,
  cancelarOrdem,
  desaprovarOrdem,
  enviarParaAprovacao,
  excluirOrdemCompra,
  rejeitarOrdem,
} from "@/modules/compras/ordens/actions";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
  OrdemDetalhe,
  ParcelaCondicaoOpcao,
} from "@/modules/compras/ordens/queries";
import { OrdemFormDrawer } from "./ordem-form-drawer";
import { RecebimentoDialog } from "./recebimento-dialog";

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
function Dado({
  rotulo,
  children,
  acao,
}: {
  rotulo: string;
  children: React.ReactNode;
  /** Ação ao lado do valor (ex: alterar o mês de referência). */
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="flex items-center gap-1.5 text-detalhe">
        {children}
        {acao}
      </span>
    </div>
  );
}

export interface OrdemDetalheViewProps {
  ordem: OrdemDetalhe;
  trilha: EventoTrilha[];
  fornecedores: FornecedorOpcao[];
  insumos: InsumoOpcao[];
  centrosCusto: CentroCustoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  categorias: CategoriaOpcao[];
  parcelasCondicao: ParcelaCondicaoOpcao[];
  anexosIniciais: AnexoDoDocumento[];
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
  podeExcluir: boolean;
  podeReceber: boolean;
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
  condicoesPagamento,
  formasPagamento,
  categorias,
  parcelasCondicao,
  anexosIniciais,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
  podeExcluir,
  podeReceber,
}: OrdemDetalheViewProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [dialogCancelar, setDialogCancelar] = React.useState(false);
  const [dialogExcluir, setDialogExcluir] = React.useState(false);
  const [dialogRecebimento, setDialogRecebimento] = React.useState(false);
  const [dialogMes, setDialogMes] = React.useState(false);
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
  const recebivel = podeReceber && ordem.status === "aprovado";

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

  async function aoExcluir() {
    const resultado = await excluirOrdemCompra(ordem.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ordem de compra excluída");
    router.push("/compras/ordens");
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
                <span className="codigo-doc">
                  {ordem.numero ?? "Sem número"}
                </span>
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
          {recebivel ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDialogRecebimento(true)}
            >
              <ReceiptText />
              Registrar recebimento
            </Button>
          ) : null}
          {podeExcluir ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDialogExcluir(true)}
            >
              <Trash2 />
              Excluir
            </Button>
          ) : null}
        </div>
      </div>

      {ordem.status === "pendente_aprovacao" || ordem.status === "aprovado" ? (
        <ApprovalBar
          status={ordem.status}
          podeAprovar={podeAprovar}
          podeDesaprovar={podeDesaprovar}
          onAprovar={aoAprovar}
          onRejeitar={aoRejeitar}
          onDesaprovar={aoDesaprovar}
        />
      ) : null}

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
              <Dado rotulo="Data da compra">
                {formatarData(ordem.dataCompra)}
              </Dado>
              <Dado
                rotulo="Mês de referência"
                acao={
                  podeEditar ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Alterar mês de referência"
                      onClick={() => setDialogMes(true)}
                    >
                      <Pencil />
                    </Button>
                  ) : undefined
                }
              >
                {formatarMesAno(ordem.mesCompetencia)}
              </Dado>
              <Dado rotulo="Criada em">{formatarData(ordem.criadoEm)}</Dado>
              <Dado rotulo="Categoria do custo">
                {ordem.categoriaNome ?? "-"}
              </Dado>
              <Dado rotulo="Condição de pagamento">
                {ordem.condicaoPagamentoDescricao ?? "-"}
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
            {/* A descrição fica fora do grid porque é texto corrido: numa
                coluna estreita ela quebraria em quatro linhas. */}
            {ordem.descricao ? (
              <div className="mt-4">
                <Dado rotulo="Descrição da compra">{ordem.descricao}</Dado>
              </div>
            ) : null}
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
                    <th className="px-3 py-2 text-right font-medium">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ordem.itens.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-0"
                    >
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

          <SecaoDetalhe card titulo="Parcelas">
            {ordem.parcelas.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Esta ordem não tem parcelas definidas. O lançamento financeiro
                nasce sem parcelas e elas são definidas em Financeiro.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border bg-card">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Nº</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Vencimento
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordem.parcelas.map((parcela) => (
                      <tr
                        key={parcela.numeroParcela}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {parcela.numeroParcela}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatarData(parcela.dataVencimento)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarBRL(parcela.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface font-semibold">
                      <td className="px-3 py-2" colSpan={2}>
                        Soma das parcelas
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarBRL(
                          ordem.parcelas.reduce(
                            (soma, parcela) => soma + parcela.valor,
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Anexos">
            <Anexos
              entidade="ordem_compra"
              entidadeId={ordem.id}
              anexos={anexosIniciais}
              podeEditar={podeEditar}
              onMudou={() => router.refresh()}
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
          anexos={anexosIniciais}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) router.refresh();
          }}
          ordem={ordem}
          fornecedores={fornecedores}
          insumos={insumos}
          centrosCusto={centrosCusto}
          condicoesPagamento={condicoesPagamento}
          formasPagamento={formasPagamento}
          categorias={categorias}
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

      <ConfirmDialog
        aberto={dialogExcluir}
        onAbertoChange={setDialogExcluir}
        titulo="Excluir ordem de compra"
        descricao="Esta ação apaga a ordem de compra, os itens e o lançamento previsto. Não é possível desfazer."
        textoConfirmar="Excluir"
        variante="destrutivo"
        onConfirmar={aoExcluir}
      />

      <AlterarMesDialog
        aberto={dialogMes}
        onAbertoChange={setDialogMes}
        entidade="ordem_compra"
        id={ordem.id}
        mesAtual={ordem.mesCompetencia}
        documentoEspelho={ordem.lancamento?.numero ?? null}
      />

      <RecebimentoDialog
        aberto={dialogRecebimento}
        onAbertoChange={(aberto) => {
          setDialogRecebimento(aberto);
          if (!aberto) router.refresh();
        }}
        ordemId={ordem.id}
        valorTotalOc={ordem.valorTotal}
        parcelasCondicao={parcelasCondicao}
      />
    </div>
  );
}
