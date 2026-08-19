"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  ExternalLink,
  PenLine,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { Anexos } from "@/components/canonicos/anexos";
import {
  BotaoEspelho,
  CelulaVazia,
  ConfirmDialog,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  formatarData,
  formatarDataHora,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import type { OrdemItem } from "@/modules/compras/ordens/queries";
import { situacaoDaParcela } from "@/modules/financeiro/aprovacao-pagamentos/aprovavel";
import {
  aprovarParcela,
  revisarParcela,
} from "@/modules/financeiro/aprovacao-pagamentos/actions";
import { mensagemAprovacao } from "@/modules/financeiro/aprovacao-pagamentos/link-aprovacao";
import {
  ehParcelaAberta,
  ROTULO_TIPO_LANCAMENTO,
  STATUS_PARCELA,
  rotuloParcela,
  type StatusLancamento,
} from "@/modules/financeiro/_shared/formato";
import { seloDoLancamento } from "@/modules/financeiro/_shared/selo-lancamento";
import type {
  LancamentoDetalhe,
  ParcelaLancamento,
} from "@/modules/financeiro/lancamentos/queries";
import { rotuloOrigemLancamento } from "@/modules/financeiro/lancamentos/schemas";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import { AprovarDialog } from "./aprovar-dialog";

const ROTA_FILA = "/financeiro/aprovacao-pagamentos";

export interface PagamentoDetalheViewProps {
  lancamento: LancamentoDetalhe;
  /** A parcela desta tela, dentro do lançamento. */
  parcela: ParcelaLancamento;
  anexos: AnexoDoDocumento[];
  trilha: EventoTrilha[];
  /** Itens da OC de origem, vazio quando o lançamento não vem de OC. */
  itensOrigem: OrdemItem[];
  /** Contas ativas, para trocar a conta na hora de aprovar. */
  contas: ContaBancariaOpcao[];
  podeAprovar: boolean;
  podeRevisar: boolean;
  /** Libera o atalho para a tela de edição do lançamento. */
  podeEditarLancamento: boolean;
  /** Nota fiscal da OC de origem ainda não registrada: avisa, não bloqueia. */
  semNota: boolean;
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-detalhe text-muted-foreground">{rotulo}</span>
      <span className="text-right text-detalhe font-medium">{children}</span>
    </div>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-legenda font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Caixa de campos, o mesmo bloco em todas as seções de leitura. */
function Campos({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      {children}
    </div>
  );
}

/**
 * Tela inteira de um pagamento que precisa de aprovação.
 *
 * Substituiu o painel lateral de conferência da fila. O motivo é a largura: o
 * painel tinha 480px para mostrar lançamento, datas, pagamento, N parcelas,
 * rateio, itens da OC, anexos e trilha, e quem recebe o link de aprovação no
 * celular lia tudo isso numa coluna estreita, rolando. Aqui a mesma informação
 * ocupa a tela, e a decisão fica na coluna da direita, sempre visível.
 *
 * Somente leitura no conteúdo: quem aprova confere o que está autorizando sem
 * risco de mexer no documento no meio da conferência. As duas únicas ações que
 * mudam algo são Aprovar e Revisar, as mesmas da fila, com as mesmas permissões
 * e as mesmas Server Actions.
 *
 * Diferente da fila, esta tela é alcançada por link direto. Então ela não pode
 * apenas esconder o botão quando a parcela não é aprovável: `situacaoDaParcela`
 * diz o que aconteceu com o pagamento, senão quem abriu o link dias depois fica
 * olhando uma tela sem botão nenhum, sem saber por quê.
 */
export function PagamentoDetalheView({
  lancamento,
  parcela,
  anexos,
  trilha,
  itensOrigem,
  contas,
  podeAprovar,
  podeRevisar,
  podeEditarLancamento,
  semNota,
}: PagamentoDetalheViewProps) {
  const router = useRouter();
  const [aprovando, setAprovando] = React.useState(false);
  const [revisando, setRevisando] = React.useState(false);

  /**
   * Selo do lançamento pela DÍVIDA, não pela etapa: esta tela existe justamente
   * para pagar, e ver "Aprovado" em verde no cabeçalho de algo que ainda se deve
   * é a leitura errada no pior lugar possível. O saldo sai das parcelas, que a
   * tela já carregou.
   */
  const abertoDoLancamento = lancamento.parcelas
    .filter((linha) => ehParcelaAberta(linha.status))
    .reduce((soma, linha) => soma + linha.valor, 0);
  const seloLancamento = seloDoLancamento(
    lancamento.status as StatusLancamento,
    "a_pagar",
    abertoDoLancamento,
  );
  const infoParcela = STATUS_PARCELA[parcela.status];
  const situacao = situacaoDaParcela({
    statusParcela: parcela.status,
    statusLancamento: lancamento.status,
    contaBancariaId: parcela.contaBancariaId,
  });

  const titulo = rotuloParcela(
    lancamento.numero,
    parcela.numeroParcela,
    lancamento.parcelas.length,
  );

  /** Volta para a fila e recarrega, para a parcela decidida sair da lista. */
  function voltarParaFila() {
    router.push(ROTA_FILA);
  }

  async function confirmarAprovacao(
    dataProgramada: string | null,
    contaId: string | null,
  ) {
    const resultado = await aprovarParcela(parcela.id, dataProgramada, contaId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setAprovando(false);
    toast.success("Pagamento aprovado");
    voltarParaFila();
  }

  async function confirmarRevisao(motivo?: string) {
    const resultado = await revisarParcela(parcela.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setRevisando(false);
    toast.success("Pagamento enviado para revisão");
    voltarParaFila();
  }

  async function copiarMensagem() {
    // Mesma mensagem da fila, montada dos dados desta tela. Serve para quem abre
    // o pagamento, confere e decide repassar para outra pessoa aprovar.
    const texto = mensagemAprovacao(
      [
        {
          id: parcela.id,
          numeroParcela: parcela.numeroParcela,
          totalParcelas: lancamento.parcelas.length,
          valor: parcela.valor,
          dataVencimento: parcela.dataVencimento,
          lancamentoId: lancamento.id,
          lancamentoNumero: lancamento.numero,
          lancamentoDescricao: lancamento.descricao,
          fornecedorNome: lancamento.fornecedorNome ?? "-",
          origem: lancamento.origem,
          origemId: lancamento.origemId,
          origemNumero: lancamento.origemNumero,
          categoriaNome: lancamento.categoriaNome,
          formaPagamentoNome: lancamento.formaPagamentoNome,
          contaBancariaId: parcela.contaBancariaId,
          contaBancariaNome: parcela.contaBancariaNome,
          dataCompra: lancamento.dataCompra,
          mesCompetencia: lancamento.mesCompetencia,
          dataProgramada: parcela.dataProgramada,
          rateios: lancamento.rateios.map((rateio) => ({
            nome: rateio.centroCustoNome,
            valor: rateio.valor,
          })),
          anexos: anexos.length,
          semNota,
        },
      ],
      window.location.origin,
    );
    if (texto === "") return;

    try {
      if (!navigator.clipboard) throw new Error("sem area de transferencia");
      await navigator.clipboard.writeText(texto);
      toast.success("Mensagem copiada. Cole no WhatsApp de quem aprova.");
    } catch {
      toast.error(
        "O navegador não deixou copiar. Verifique a permissão de área de transferência.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a fila de aprovação"
            onClick={voltarParaFila}
          >
            <ArrowLeft />
          </Button>
          <div>
            <p className="text-legenda tracking-wide text-muted-foreground uppercase">
              Financeiro · Aprovação de pagamentos
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-titulo font-semibold">
                <span className="codigo-doc">{titulo}</span>
              </h1>
              {infoParcela ? (
                <StatusBadge
                  status={infoParcela.badge}
                  rotulo={infoParcela.rotulo}
                />
              ) : null}
              {semNota ? (
                <StatusBadge status="pendente_aprovacao" rotulo="Sem nota" />
              ) : null}
            </div>
            <p className="text-detalhe text-muted-foreground">
              {lancamento.fornecedorNome ?? "Sem fornecedor"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Vale em QUALQUER status, igual à fila e a lancamentos. A
              proteção não sumiu, mudou de camada: quem garante que o papel não
              afirma pagamento inexistente é a página do espelho
              (src/app/(espelho)/espelho/pagamentos/page.tsx), que degrada
              sozinha quando a parcela não tem status 'pago' — o documento sai
              intitulado "Parcela" em vez de "Pagamento", e "Saiu da conta" e
              "Pago em" saem como travessão. A guarda mora lá porque o link é
              colável: guarda que só existe no botão não é guarda. */}
          <BotaoEspelho rota="/espelho/pagamentos" ids={[parcela.id]} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copiarMensagem()}
          >
            <ClipboardCopy />
            Copiar mensagem de aprovação
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Secao titulo="Lançamento">
            <Campos>
              <Linha rotulo="Tipo">
                {ROTULO_TIPO_LANCAMENTO[lancamento.tipo]}
              </Linha>
              <Linha rotulo="Status do lançamento">
                <span className="inline-flex flex-wrap items-center gap-1">
                  <StatusBadge
                    status={seloLancamento.badge}
                    rotulo={seloLancamento.rotulo}
                  />
                  {seloLancamento.etapa ? (
                    <StatusBadge
                      status="aprovado"
                      rotulo={seloLancamento.etapa}
                      discreto
                    />
                  ) : null}
                </span>
              </Linha>
              <Linha rotulo="Fornecedor">
                {lancamento.fornecedorNome ?? <CelulaVazia />}
              </Linha>
              <Linha rotulo="Descrição">{lancamento.descricao}</Linha>
              <Linha rotulo="Categoria do custo">
                {lancamento.categoriaNome ?? <CelulaVazia />}
              </Linha>
              <Linha rotulo="Valor do lançamento">
                <MoneyText valor={lancamento.valor} />
              </Linha>
              <Linha rotulo="Origem">
                {lancamento.origem === "oc" && lancamento.origemId ? (
                  <Link
                    href={`/compras/ordens/${lancamento.origemId}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <span className="codigo-doc">
                      {lancamento.origemNumero ?? "Ordem de compra"}
                    </span>
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  rotuloOrigemLancamento(lancamento.origem)
                )}
              </Linha>
              {lancamento.observacoes ? (
                <Linha rotulo="Observações">{lancamento.observacoes}</Linha>
              ) : null}
            </Campos>
          </Secao>

          <Secao titulo="Datas">
            <Campos>
              <Linha rotulo="Criado em">
                {formatarDataHora(lancamento.criadoEm)}
              </Linha>
              <Linha rotulo="Data da compra / NF">
                {lancamento.dataCompra ? (
                  formatarData(lancamento.dataCompra)
                ) : (
                  <CelulaVazia />
                )}
              </Linha>
              <Linha rotulo="Mês de referência">
                {lancamento.mesCompetencia ? (
                  formatarMesAno(lancamento.mesCompetencia)
                ) : (
                  <CelulaVazia />
                )}
              </Linha>
              <Linha rotulo="Vencimento desta parcela">
                {parcela.dataVencimento ? (
                  formatarData(parcela.dataVencimento)
                ) : (
                  <CelulaVazia />
                )}
              </Linha>
              <Linha rotulo="Data programada">
                {parcela.dataProgramada
                  ? formatarData(parcela.dataProgramada)
                  : "definida na aprovação"}
              </Linha>
            </Campos>
          </Secao>

          <Secao titulo="Pagamento">
            <Campos>
              <Linha rotulo="Forma">
                {lancamento.formaPagamentoNome ?? <CelulaVazia />}
              </Linha>
              <Linha rotulo="Condição">
                {lancamento.condicaoPagamentoDescricao ?? <CelulaVazia />}
              </Linha>
              <Linha rotulo="Conta bancária">
                {parcela.contaBancariaNome ?? <CelulaVazia />}
              </Linha>
            </Campos>
          </Secao>

          <Secao titulo={`Parcelas (${lancamento.parcelas.length})`}>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead className="bg-surface">
                  {/*
                    Todo cabeçalho centralizado, igual ao DataTable canônico. O
                    valor da célula continua à direita (vírgula embaixo de
                    vírgula); rótulo não tem vírgula para alinhar. Estas tabelas
                    são à mão porque são leitura pura dentro de uma seção, sem
                    filtro, ordenação nem preferência de coluna: o DataTable aqui
                    seria peso sem função. Mas a régua do cabeçalho é a mesma.
                  */}
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className="px-3 py-1.5 text-center font-medium">#</th>
                    <th className="px-3 py-1.5 text-center font-medium">
                      Vencimento
                    </th>
                    <th className="px-3 py-1.5 text-center font-medium">
                      Status
                    </th>
                    <th className="px-3 py-1.5 text-center font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lancamento.parcelas.map((linha) => {
                    const info = STATUS_PARCELA[linha.status];
                    const ehEsta = linha.id === parcela.id;
                    return (
                      <tr
                        key={linha.id}
                        className={
                          ehEsta
                            ? "border-b border-border bg-primary/5 last:border-0"
                            : "border-b border-border last:border-0"
                        }
                      >
                        <td className="px-3 py-1.5 text-center tabular-nums">
                          {linha.numeroParcela}
                          {/* Marca qual das 57 parcelas é a desta tela: sem
                              isso a tabela vira uma lista onde a pessoa perde
                              de vista o que ela está aprovando. */}
                          {ehEsta ? (
                            <span className="ml-1.5 text-legenda text-primary">
                              esta
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-center tabular-nums">
                          {linha.dataVencimento
                            ? formatarData(linha.dataVencimento)
                            : "-"}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {info ? (
                            <StatusBadge
                              status={info.badge}
                              rotulo={info.rotulo}
                            />
                          ) : (
                            linha.status
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <MoneyText valor={linha.valor} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Secao>

          <Secao titulo="Rateio por centro de custo">
            {lancamento.rateios.length === 0 ? (
              <Campos>
                <p className="text-detalhe text-muted-foreground">
                  Sem rateio informado.
                </p>
              </Campos>
            ) : (
              <Campos>
                {lancamento.rateios.map((rateio) => (
                  <Linha
                    key={rateio.id}
                    rotulo={
                      rateio.centroCustoCodigo
                        ? `${rateio.centroCustoCodigo} - ${rateio.centroCustoNome}`
                        : rateio.centroCustoNome
                    }
                  >
                    <MoneyText valor={rateio.valor} />
                  </Linha>
                ))}
              </Campos>
            )}
          </Secao>

          {itensOrigem.length > 0 ? (
            <Secao titulo="Itens da ordem de compra">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead className="bg-surface">
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-1.5 text-center font-medium">
                        Insumo
                      </th>
                      <th className="px-3 py-1.5 text-center font-medium">
                        Centro de custo
                      </th>
                      <th className="px-3 py-1.5 text-center font-medium">
                        Quantidade
                      </th>
                      <th className="px-3 py-1.5 text-center font-medium">
                        Preço unitário
                      </th>
                      <th className="px-3 py-1.5 text-center font-medium">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensOrigem.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-1.5">{item.insumoNome}</td>
                        <td className="px-3 py-1.5 text-center">
                          {item.centroCustoNome}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatarQuantidade(item.quantidade)}
                          {item.unidade ? ` ${item.unidade}` : ""}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <MoneyText valor={item.precoUnitario} />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <MoneyText valor={item.subtotal} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {/* A decisão fica na direita e acompanha a rolagem: numa tela cheia,
              rolar até o fim da conferência para achar o botão de aprovar é o
              tipo de atrito que faz a pessoa aprovar sem terminar de ler. */}
          <div className="flex flex-col gap-3 rounded-md border border-border border-l-[3px] border-l-faixa bg-surface p-4 lg:sticky lg:top-4">
            <div>
              <p className="text-legenda tracking-wide text-muted-foreground uppercase">
                Valor desta parcela
              </p>
              <p className="text-titulo font-semibold tabular-nums">
                <MoneyText valor={parcela.valor} />
              </p>
            </div>

            {situacao.podeAprovar ? (
              <>
                {semNota ? (
                  <p className="flex items-start gap-1.5 text-legenda text-muted-foreground">
                    <TriangleAlert
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    A ordem de compra de origem ainda não tem nota fiscal
                    registrada. Não impede aprovar.
                  </p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {podeAprovar ? (
                    <Button type="button" onClick={() => setAprovando(true)}>
                      <Check />
                      Aprovar pagamento
                    </Button>
                  ) : null}
                  {podeRevisar ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRevisando(true)}
                    >
                      <PenLine />
                      Enviar para revisão
                    </Button>
                  ) : null}
                  {!podeAprovar && !podeRevisar ? (
                    <p className="text-detalhe text-muted-foreground">
                      Você pode ver este pagamento, mas não tem permissão para
                      aprovar nem para enviar para revisão.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-detalhe text-muted-foreground">
                {situacao.motivo}
              </p>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={voltarParaFila}
            >
              Ver a fila de aprovação
            </Button>
            {podeEditarLancamento ? (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link href={`/financeiro/lancamentos/${lancamento.id}`}>
                  Abrir lançamento completo
                  <ExternalLink />
                </Link>
              </Button>
            ) : null}
          </div>

          <Secao titulo="Anexos">
            {/* `podeEditar` falso de propósito: tela de conferência não mexe no
                documento que está sendo aprovado. Dá para ver e baixar. */}
            <Anexos
              entidade="lancamento"
              entidadeId={lancamento.id}
              anexos={anexos}
              podeEditar={false}
            />
          </Secao>

          <Secao titulo="Trilha">
            <Trilha eventos={trilha} />
          </Secao>
        </div>
      </div>

      <AprovarDialog
        aberto={aprovando}
        onAbertoChange={setAprovando}
        quantidade={1}
        valorTotal={parcela.valor}
        vencimento={parcela.dataVencimento}
        contas={contas}
        contaAtualId={parcela.contaBancariaId}
        contaAtualNome={parcela.contaBancariaNome}
        onConfirmar={confirmarAprovacao}
      />

      <ConfirmDialog
        aberto={revisando}
        onAbertoChange={setRevisando}
        titulo="Enviar para revisão"
        descricao="A parcela sai da fila e volta para quem lançou ajustar. Nada é cancelado: o lançamento continua valendo e continua na previsão de caixa. Diga o que precisa ser corrigido (ex.: valor divergente da NF, falta anexo, centro de custo errado)."
        textoConfirmar="Enviar para revisão"
        exigeMotivo
        onConfirmar={confirmarRevisao}
      />
    </div>
  );
}
