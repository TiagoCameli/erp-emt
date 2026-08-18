"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  History,
  Lock,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { Anexos } from "@/components/canonicos/anexos";
import {
  CelulaVazia,
  Combobox,
  ConfirmDialog,
  EmptyState,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import { AlterarMesDialog } from "@/modules/_shared/alterar-mes-dialog";
import {
  definirContaLancamento,
  excluirLancamento,
  reenviarParcela,
} from "@/modules/financeiro/lancamentos/actions";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import {
  ehParcelaAberta,
  ROTULO_TIPO_LANCAMENTO,
  STATUS_PARCELA,
} from "@/modules/financeiro/_shared/formato";
import { seloDoLancamento } from "@/modules/financeiro/_shared/selo-lancamento";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { CAMINHO_DO_PAGAMENTO } from "@/modules/_shared/forma-pagamento";
import { ROTULO_ORIGEM_DATA } from "@/modules/financeiro/_shared/janela-pagamento";
import { rotuloOrigemLancamento } from "@/modules/financeiro/lancamentos/schemas";
import { DefinirParcelasDialog } from "./definir-parcelas-dialog";
import { LancamentoFormDrawer } from "./lancamento-form-drawer";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
  CondicaoPagamentoOpcao,
  FormaPagamentoOpcao,
  FornecedorOpcao,
  LancamentoDetalhe,
} from "@/modules/financeiro/lancamentos/queries";

/** Card de seção do detalhe (mesmo tratamento visual do detalhe da OC). */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  /** Ação alinhada à direita do título (ex: definir parcelas). */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-secao font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Linha rotulada para os dados do cabeçalho. */
function Dado({
  rotulo,
  children,
  legenda,
  acao,
}: {
  rotulo: string;
  children: React.ReactNode;
  /** Linha extra abaixo do valor, para explicar o que aquele dado provoca. */
  legenda?: string | null;
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
      {legenda ? (
        <span className="text-legenda text-muted-foreground">{legenda}</span>
      ) : null}
    </div>
  );
}

/**
 * Aviso do que está travando ou do que ainda falta neste lançamento. Existe
 * porque tela muda é a pior parte de um ERP: o usuário procura a parcela numa
 * fila onde ela nunca vai aparecer e não descobre o motivo.
 */
function Aviso({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-3">
      <div className="flex items-start gap-2">
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-status-pendente"
          aria-hidden="true"
        />
        <div>
          <p className="text-detalhe font-medium">{titulo}</p>
          <p className="text-legenda text-muted-foreground">{texto}</p>
        </div>
      </div>
      {acao}
    </div>
  );
}

export interface LancamentoDetalheViewProps {
  lancamento: LancamentoDetalhe;
  trilha: EventoTrilha[];
  /** Trilha das parcelas (aprovação, revisão, reprogramação...), lida de `parcela_eventos`. */
  trilhaParcelas: EventoTrilha[];
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  centrosCusto: CentroCustoOpcao[];
  formasPagamento: FormaPagamentoOpcao[];
  condicoesPagamento: CondicaoPagamentoOpcao[];
  podeEditar: boolean;
  anexos: AnexoDoDocumento[];
  podeExcluir: boolean;
  /** Contas ativas, para a escolha que libera a aprovação do pagamento. */
  contas: ContaBancariaOpcao[];
}

/**
 * Detalhe do lançamento: cabeçalho, dados, parcelas com status, rateio por
 * centro de custo e trilha. A edição é bloqueada para lançamentos de origem
 * diferente de 'manual' (ex: vindos de uma OC) ou com alguma parcela já
 * aprovada ou paga: aprovado se edita desaprovando primeiro.
 */
export function LancamentoDetalheView({
  lancamento,
  trilha,
  trilhaParcelas,
  categorias,
  fornecedores,
  centrosCusto,
  formasPagamento,
  condicoesPagamento,
  podeEditar,
  anexos,
  podeExcluir,
  contas,
}: LancamentoDetalheViewProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [parcelasAberto, setParcelasAberto] = React.useState(false);
  const [reenviando, setReenviando] = React.useState<string | null>(null);
  const [salvandoConta, setSalvandoConta] = React.useState(false);

  // A conta é a mesma para as parcelas não pagas do lançamento, então basta ler a
  // primeira: quem muda escolhe para todas.
  const contaAtual =
    lancamento.parcelas.find((parcela) => parcela.status !== "pago")
      ?.contaBancariaId ?? "";

  async function aoDefinirConta(contaId: string) {
    setSalvandoConta(true);
    try {
      const resultado = await definirContaLancamento(lancamento.id, contaId);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Conta bancária definida");
      router.refresh();
    } finally {
      setSalvandoConta(false);
    }
  }

  // Caminho de volta da revisão: quem corrigiu devolve a parcela para a fila.
  async function aoReenviar(parcelaId: string) {
    setReenviando(parcelaId);
    try {
      const resultado = await reenviarParcela(parcelaId);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Parcela reenviada para aprovação");
      router.refresh();
    } finally {
      setReenviando(null);
    }
  }
  const [confirmarExcluir, setConfirmarExcluir] = React.useState(false);
  const [dialogMes, setDialogMes] = React.useState(false);

  async function handleExcluir() {
    const resultado = await excluirLancamento(lancamento.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Lançamento excluído");
    router.push("/financeiro/lancamentos");
  }

  const ehManual = lancamento.origem === "manual";
  const temParcelaPaga = lancamento.parcelas.some(
    (parcela) => parcela.status === "pago",
  );
  const temParcelaAprovada = lancamento.parcelas.some(
    (parcela) => parcela.status === "aprovado",
  );
  // Sem parcela definida o lançamento não entra na fila de aprovação nem pode
  // ser pago: é um estado a resolver, não um detalhe.
  const semParcelas = lancamento.parcelas.length === 0;
  const temParcelaFechada = temParcelaAprovada || temParcelaPaga;
  // Lançamento de origem tem o cabeçalho travado, mas as parcelas dele podem
  // ser definidas aqui enquanto nenhuma foi aprovada ou paga.
  const podeDefinirParcelas = podeEditar && !ehManual && !temParcelaFechada;
  // Aprovado também tranca a edição, não só pago: editar regrava as parcelas do
  // zero, e isso apagaria a aprovação (data programada, conta e quem aprovou).
  // Quem precisa mudar desaprova o pagamento primeiro. A trava final é o banco
  // (fn_salvar_lancamento recusa), aqui é para ninguém tentar em vão.
  const editavel = podeEditar && ehManual && !temParcelaFechada;
  /**
   * Selo pela DÍVIDA, não pela etapa. O saldo sai das parcelas, que o detalhe já
   * carregou: `aberto` é tudo que não está pago nem cancelado.
   */
  const abertoDoLancamento = lancamento.parcelas
    .filter((parcela) => ehParcelaAberta(parcela.status))
    .reduce((soma, parcela) => soma + parcela.valor, 0);
  const selo = seloDoLancamento(
    lancamento.status,
    lancamento.tipo,
    abertoDoLancamento,
  );

  // Caminho do pagamento: quem decide é o tipo da forma de pagamento, e é o que
  // explica por que uma parcela nasceu aprovada, quitada, ou foi para a fila.
  const quitadoNoCartao =
    lancamento.formaPagamentoTipo === "cartao_credito" &&
    lancamento.status === "pago";
  const incompleto = lancamento.status === "previsto";
  // Dinheiro e cartão pagam antes da nota chegar. Quitado sem nota registrada é
  // documento faltando, e some no fim do mês se a tela não avisar.
  const quitadoSemNota =
    lancamento.origem === "oc" &&
    lancamento.status === "pago" &&
    !lancamento.notaRegistrada;

  // Pago vem antes de aprovado porque é o bloqueio mais duro: com parcela paga
  // não há caminho de volta pela desaprovação, e é o que o banco responde
  // primeiro. Cada texto diz o que fazer, não só o que travou.
  const motivoBloqueio = !ehManual
    ? `Lançamento de origem ${rotuloOrigemLancamento(lancamento.origem)}. Edite na origem.`
    : temParcelaPaga
      ? "Tem parcela paga. Não dá para editar."
      : temParcelaAprovada
        ? "Pagamento aprovado. Desaprove o pagamento para editar."
        : null;

  const somaRateios = lancamento.rateios.reduce(
    (total, rateio) => total + rateio.valor,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista"
            onClick={() => router.push("/financeiro/lancamentos")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold">
                <span className="codigo-doc">
                  {lancamento.numero ?? "Sem número"}
                </span>
              </h1>
              <StatusBadge status={selo.badge} rotulo={selo.rotulo} />
              {selo.etapa ? (
                <StatusBadge status="aprovado" rotulo={selo.etapa} discreto />
              ) : null}
              {/* "Conta a pagar" e não "A pagar": 'a_pagar' também é nome de
                  status, e os dois badges lado a lado se contradiziam. */}
              <StatusBadge
                status={
                  lancamento.tipo === "a_receber"
                    ? "aprovado"
                    : "pendente_aprovacao"
                }
                rotulo={`Conta ${ROTULO_TIPO_LANCAMENTO[
                  lancamento.tipo
                ].toLowerCase()}`}
              />
              {semParcelas ? (
                <StatusBadge status="rejeitado" rotulo="Parcelas pendentes" />
              ) : null}
              {quitadoNoCartao ? (
                <StatusBadge status="pago" rotulo="Pago no cartão" />
              ) : null}
            </div>
            <p className="text-detalhe text-muted-foreground">
              {lancamento.descricao}
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
          ) : podeEditar && motivoBloqueio ? (
            <span className="flex items-center gap-1.5 text-legenda text-muted-foreground">
              <Lock className="size-3.5" aria-hidden="true" />
              {motivoBloqueio}
            </span>
          ) : null}
          {podeExcluir ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmarExcluir(true)}
            >
              <Trash2 />
              Excluir
            </Button>
          ) : null}
        </div>
      </div>

      {incompleto ? (
        <Aviso
          titulo="Lançamento incompleto"
          texto={`As parcelas precisam somar ${formatarBRL(
            lancamento.valor,
          )} para este lançamento entrar na fila de aprovação. Enquanto estiver assim, ele não é aprovado nem pago.`}
          acao={
            podeDefinirParcelas ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setParcelasAberto(true)}
              >
                <CalendarClock />
                Definir parcelas
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {quitadoSemNota ? (
        <Aviso
          titulo="Nota fiscal pendente"
          texto={`Este lançamento já está quitado e a nota fiscal ${
            lancamento.origemNumero
              ? `da ${lancamento.origemNumero}`
              : "da ordem de origem"
          } ainda não foi registrada. Registre o recebimento na ordem para fechar o ciclo.`}
          acao={
            lancamento.origemId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/compras/ordens/${lancamento.origemId}`)
                }
              >
                <ExternalLink />
                Abrir a ordem
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Secao titulo="Dados do lançamento">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Tipo">
                {ROTULO_TIPO_LANCAMENTO[lancamento.tipo]}
              </Dado>
              <Dado rotulo="Fornecedor">
                {lancamento.fornecedorNome ?? <CelulaVazia />}
              </Dado>
              <Dado rotulo="Categoria">{lancamento.categoriaNome ?? <CelulaVazia />}</Dado>
              <Dado
                rotulo="Forma de pagamento"
                legenda={
                  lancamento.formaPagamentoTipo
                    ? CAMINHO_DO_PAGAMENTO[lancamento.formaPagamentoTipo]
                    : null
                }
              >
                {lancamento.formaPagamentoNome ?? <CelulaVazia />}
              </Dado>
              {/* Vale para os dois casos: no avulso a condição é a do próprio
                  lançamento, no de OC é a da ordem de origem. A legenda diz de
                  onde ela vem para ninguém procurar no lugar errado. */}
              <Dado
                rotulo="Condição de pagamento"
                legenda={
                  lancamento.condicaoPagamentoDescricao && !ehManual
                    ? "Vem da ordem de origem"
                    : null
                }
              >
                {lancamento.condicaoPagamentoDescricao ?? <CelulaVazia />}
              </Dado>
              <Dado rotulo="Data da compra">
                {formatarData(lancamento.dataCompra)}
              </Dado>
              <Dado
                rotulo="Mês de referência"
                legenda="Define em qual mês o custo entra"
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
                {formatarMesAno(lancamento.mesCompetencia)}
              </Dado>
              <Dado rotulo="Criado em">
                {formatarData(lancamento.criadoEm)}
              </Dado>
              <Dado rotulo="Vencimento">
                {lancamento.dataVencimento ? (
                  formatarData(lancamento.dataVencimento)
                ) : (
                  <CelulaVazia />
                )}
              </Dado>
              <Dado rotulo="Valor">
                <MoneyText valor={lancamento.valor} className="font-semibold" />
              </Dado>
            </div>
          </Secao>

          <Secao titulo="Conta bancária do pagamento">
            {/* Passo de revisão: sem conta escolhida a parcela não entra na fila
                de aprovação, e o banco recusa aprovar. Escolher aqui é o que
                libera o pagamento para ser aprovado. */}
            <div className="flex flex-col gap-2">
              <Combobox
                id="lancamento-conta"
                valor={contaAtual}
                onValorChange={(valor) => void aoDefinirConta(valor)}
                opcoes={contas.map((conta) => ({
                  valor: conta.id,
                  rotulo: conta.nome,
                }))}
                placeholder="Escolha a conta de onde o dinheiro sai"
                disabled={!podeEditar || salvandoConta}
                className="w-full max-w-md"
              />
              {contaAtual === "" ? (
                <p className="flex items-start gap-1.5 text-legenda text-status-pendente">
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  Enquanto não houver conta escolhida, este pagamento não aparece
                  na fila de aprovação.
                </p>
              ) : null}
            </div>
          </Secao>

          <Secao
            titulo="Parcelas"
            acao={
              podeDefinirParcelas ? (
                <Button
                  type="button"
                  variant={semParcelas ? "default" : "outline"}
                  size="sm"
                  onClick={() => setParcelasAberto(true)}
                >
                  <CalendarClock />
                  {semParcelas ? "Definir parcelas" : "Editar parcelas"}
                </Button>
              ) : undefined
            }
          >
            {semParcelas ? (
              <p className="rounded-md border border-dashed border-border bg-surface/50 px-3 py-3 text-detalhe text-muted-foreground">
                Este lançamento não tem parcelas definidas. Enquanto estiver
                assim, ele não entra na fila de aprovação de pagamentos e não
                pode ser pago.
                {podeDefinirParcelas
                  ? " Use \u201cDefinir parcelas\u201d para resolver."
                  : ""}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead>
                    {/* Centralizado é o padrão de tabela do app (ver
                        DataTable); só dinheiro, quantidade, total, percentual e
                        horas vão à direita. */}
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-center font-medium">#</th>
                      <th className="px-3 py-2 text-center font-medium">
                        Vencimento
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        Data programada
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        Conta
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        Pagamento
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        Status
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Valor
                      </th>
                      <th className="px-3 py-2 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamento.parcelas.map((parcela) => {
                      const infoParcela = STATUS_PARCELA[parcela.status];
                      return (
                        <tr
                          key={parcela.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-3 py-2 text-center tabular-nums">
                            {parcela.numeroParcela}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {parcela.dataVencimento ? (
                              formatarData(parcela.dataVencimento)
                            ) : (
                              <CelulaVazia />
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {parcela.dataProgramada ? (
                              <span className="flex flex-col">
                                <span className="tabular-nums">
                                  {formatarData(parcela.dataProgramada)}
                                </span>
                                {parcela.dataProgramadaOrigem ? (
                                  <span className="text-legenda text-muted-foreground">
                                    {
                                      ROTULO_ORIGEM_DATA[
                                        parcela.dataProgramadaOrigem
                                      ]
                                    }
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <CelulaVazia />
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {parcela.contaBancariaNome ?? <CelulaVazia />}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {parcela.dataPagamento ? (
                              formatarData(parcela.dataPagamento)
                            ) : (
                              <CelulaVazia />
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <StatusBadge
                              status={infoParcela.badge}
                              rotulo={infoParcela.rotulo}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <MoneyText valor={parcela.valor} />
                            {/* Desconto só aparece quando existe: linha extra em
                                toda parcela viraria ruído numa coluna de
                                dinheiro. Mostra a conta feita porque é o líquido
                                que saiu da conta bancária. */}
                            {parcela.desconto > 0 ? (
                              <span className="block text-legenda text-muted-foreground">
                                desconto{" "}
                                <MoneyText
                                  valor={parcela.desconto}
                                  className="inline"
                                />
                                , líquido{" "}
                                <MoneyText
                                  valor={parcela.valorLiquido}
                                  className="inline"
                                />
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {parcela.status === "em_revisao" && podeEditar ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={reenviando === parcela.id}
                                onClick={() => void aoReenviar(parcela.id)}
                              >
                                {reenviando === parcela.id
                                  ? "Reenviando..."
                                  : "Reenviar para aprovação"}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      {/* colSpan 6: são 8 colunas (#, vencimento, programada,
                          conta, pagamento, status, valor, ação). Com 5 o total
                          caía embaixo de "Status", uma coluna à esquerda do
                          dinheiro que ele soma. */}
                      <td className="px-3 py-2 text-center" colSpan={6}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText valor={lancamento.valor} />
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Secao>

          <Secao titulo="Anexos">
            <Anexos
              entidade="lancamento"
              entidadeId={lancamento.id}
              anexos={anexos}
              podeEditar={podeEditar}
              onMudou={() => router.refresh()}
            />
          </Secao>

          <Secao titulo="Rateio por centro de custo">
            {lancamento.rateios.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-center font-medium">
                        Centro de custo
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamento.rateios.map((rateio) => (
                      <tr
                        key={rateio.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2 text-center">
                          {rateio.centroCustoCodigo ? (
                            <span className="codigo-doc mr-1.5">
                              {rateio.centroCustoCodigo}
                            </span>
                          ) : null}
                          {rateio.centroCustoNome}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={rateio.valor} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="px-3 py-2 text-center">
                        Total do rateio
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText valor={somaRateios} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-detalhe text-muted-foreground">
                Sem rateio. O custo não foi distribuído por centro de custo.
              </p>
            )}
          </Secao>

          {/* Só aparece quando existe: seção vazia em detalhe de ERP é ruído.
              whitespace-pre-line porque o texto foi escrito num textarea, e as
              quebras de linha que a pessoa deu fazem parte do recado. */}
          {lancamento.observacoes ? (
            <Secao titulo="Observações">
              <p className="whitespace-pre-line text-detalhe">
                {lancamento.observacoes}
              </p>
            </Secao>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-1">
          <Secao titulo="Trilha">
            <Trilha eventos={trilha} />
          </Secao>

          <Secao titulo="Trilha das parcelas">
            {trilhaParcelas.length > 0 ? (
              <Trilha eventos={trilhaParcelas} />
            ) : (
              <EmptyState
                icone={History}
                titulo="Sem movimentação nas parcelas"
                descricao="Aprovações, reprogramações e outras mudanças nas parcelas deste lançamento aparecem aqui."
              />
            )}
          </Secao>
        </div>
      </div>

      {editavel ? (
        <LancamentoFormDrawer
          anexos={anexos}
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) router.refresh();
          }}
          lancamento={lancamento}
          categorias={categorias}
          formasPagamento={formasPagamento}
          condicoesPagamento={condicoesPagamento}
          fornecedores={fornecedores}
          centrosCusto={centrosCusto}
        />
      ) : null}

      {podeEditar ? (
        <AlterarMesDialog
          aberto={dialogMes}
          onAbertoChange={setDialogMes}
          entidade="lancamento"
          id={lancamento.id}
          mesAtual={lancamento.mesCompetencia}
          documentoEspelho={lancamento.origemNumero}
        />
      ) : null}

      {podeDefinirParcelas ? (
        <DefinirParcelasDialog
          aberto={parcelasAberto}
          onAbertoChange={(aberto) => {
            setParcelasAberto(aberto);
            if (!aberto) router.refresh();
          }}
          lancamentoId={lancamento.id}
          valor={lancamento.valor}
          parcelasAtuais={lancamento.parcelas.map((parcela) => ({
            dataVencimento: parcela.dataVencimento,
            valor: parcela.valor,
          }))}
          condicaoDescricao={lancamento.condicaoPagamentoDescricao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarExcluir}
          onAbertoChange={setConfirmarExcluir}
          titulo="Excluir lançamento"
          descricao="O lançamento e suas parcelas e rateios serão excluídos. Esta ação não pode ser desfeita."
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={handleExcluir}
        />
      ) : null}
    </div>
  );
}
