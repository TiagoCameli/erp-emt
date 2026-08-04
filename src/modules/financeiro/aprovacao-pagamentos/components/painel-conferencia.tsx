"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";

import { Anexos } from "@/components/canonicos/anexos";
import {
  CelulaVazia,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatarData,
  formatarDataHora,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import type { OrdemItem } from "@/modules/compras/ordens/queries";
import { detalheDaFila } from "@/modules/financeiro/aprovacao-pagamentos/actions";
import type { ParcelaPendente } from "@/modules/financeiro/aprovacao-pagamentos/queries";
import {
  ROTULO_TIPO_LANCAMENTO,
  STATUS_LANCAMENTO,
  STATUS_PARCELA,
  rotuloParcela,
} from "@/modules/financeiro/_shared/formato";
import type { LancamentoDetalhe } from "@/modules/financeiro/lancamentos/queries";

interface Carga {
  lancamento: LancamentoDetalhe;
  anexos: AnexoDoDocumento[];
  trilha: EventoTrilha[];
  itensOrigem: OrdemItem[];
}

export interface PainelConferenciaProps {
  /** Parcela em conferência, ou null com o painel fechado. */
  parcela: ParcelaPendente | null;
  onFechar: () => void;
  /** Navegação na fila sem fechar o painel (null quando é a ponta da lista). */
  onAnterior: (() => void) | null;
  onProximo: (() => void) | null;
  posicao: { atual: number; total: number } | null;
  podeAprovar: boolean;
  podeRevisar: boolean;
  /** Libera o atalho para a tela de edição do lançamento. */
  podeEditarLancamento: boolean;
  onAprovar: (parcela: ParcelaPendente) => void;
  onRevisar: (parcela: ParcelaPendente) => void;
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
      <h3 className="text-legenda font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/**
 * Painel de conferência da fila de aprovação: o lançamento inteiro, somente
 * leitura, sem sair da fila.
 *
 * Read-only não é limitação, é o ponto: quem aprova precisa conferir o que está
 * autorizando sem risco de mexer no documento no meio da conferência. Não há
 * campo editável nem botão de salvar aqui. As únicas ações são as mesmas da
 * linha (Aprovar e Revisar) e, para quem tem permissão de editar, o atalho para
 * o lançamento completo.
 *
 * A carga é sob demanda (uma ação por abertura) e as setas trocam de parcela sem
 * fechar, para aprovar em sequência.
 */
export function PainelConferencia({
  parcela,
  onFechar,
  onAnterior,
  onProximo,
  posicao,
  podeAprovar,
  podeRevisar,
  podeEditarLancamento,
  onAprovar,
  onRevisar,
}: PainelConferenciaProps) {
  const lancamentoId = parcela?.lancamentoId ?? null;

  // Um estado só, chaveado pelo lançamento: trocar de parcela invalida a carga
  // anterior no próprio render (padrão de ajuste durante o render), em vez de um
  // setState dentro do efeito, que dispararia render em cascata.
  const [estado, setEstado] = React.useState<{
    id: string | null;
    carga: Carga | null;
    falhou: boolean;
  }>({ id: null, carga: null, falhou: false });

  if (estado.id !== lancamentoId) {
    setEstado({ id: lancamentoId, carga: null, falhou: false });
  }

  React.useEffect(() => {
    if (!lancamentoId) return;
    let ativo = true;
    void detalheDaFila(lancamentoId).then((resultado) => {
      if (!ativo) return;
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        setEstado((atual) =>
          atual.id === lancamentoId ? { ...atual, falhou: true } : atual,
        );
        return;
      }
      setEstado((atual) =>
        atual.id === lancamentoId ? { ...atual, carga: resultado } : atual,
      );
    });
    return () => {
      ativo = false;
    };
  }, [lancamentoId]);

  const carga = estado.id === lancamentoId ? estado.carga : null;
  const carregando = lancamentoId !== null && carga === null && !estado.falhou;

  const lancamento = carga?.lancamento ?? null;
  const infoStatus = lancamento ? STATUS_LANCAMENTO[lancamento.status] : null;

  return (
    <Sheet
      open={parcela !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="codigo-doc">
                {parcela
                  ? rotuloParcela(
                      parcela.lancamentoNumero,
                      parcela.numeroParcela,
                      parcela.totalParcelas,
                    )
                  : ""}
              </SheetTitle>
              <SheetDescription>
                Conferência somente leitura. Nada aqui altera o lançamento.
              </SheetDescription>
            </div>
            {posicao ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Pagamento anterior da fila"
                  disabled={!onAnterior}
                  onClick={() => onAnterior?.()}
                >
                  <ChevronLeft />
                </Button>
                <span className="text-legenda tabular-nums text-muted-foreground">
                  {posicao.atual} de {posicao.total}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Próximo pagamento da fila"
                  disabled={!onProximo}
                  onClick={() => onProximo?.()}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {carregando ? (
            <div className="flex items-center gap-2 text-detalhe text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Carregando o lançamento...
            </div>
          ) : !lancamento || !parcela ? (
            <p className="text-detalhe text-muted-foreground">
              Não foi possível carregar este lançamento.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <Secao titulo="Lançamento">
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <Linha rotulo="Tipo">
                    {ROTULO_TIPO_LANCAMENTO[lancamento.tipo]}
                  </Linha>
                  <Linha rotulo="Status">
                    {infoStatus ? (
                      <StatusBadge
                        status={infoStatus.badge}
                        rotulo={infoStatus.rotulo}
                      />
                    ) : (
                      lancamento.status
                    )}
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
                      "Manual"
                    )}
                  </Linha>
                </div>
              </Secao>

              <Secao titulo="Datas">
                <div className="rounded-md border border-border bg-surface px-3 py-2">
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
                </div>
              </Secao>

              <Secao titulo="Pagamento">
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <Linha rotulo="Forma">
                    {parcela.formaPagamentoNome ?? <CelulaVazia />}
                  </Linha>
                  <Linha rotulo="Condição">
                    {lancamento.condicaoPagamentoDescricao ?? <CelulaVazia />}
                  </Linha>
                </div>
              </Secao>

              <Secao titulo={`Parcelas (${lancamento.parcelas.length})`}>
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-detalhe">
                    <thead className="bg-surface">
                      {/* Centralizado é o padrão de tabela do app (ver
                          DataTable); só dinheiro, quantidade, total, percentual
                          e horas vão à direita. */}
                      <tr className="border-b border-border text-legenda text-muted-foreground">
                        <th className="px-3 py-1.5 text-center font-medium">
                          #
                        </th>
                        <th className="px-3 py-1.5 text-center font-medium">
                          Vencimento
                        </th>
                        <th className="px-3 py-1.5 text-center font-medium">
                          Status
                        </th>
                        <th className="px-3 py-1.5 text-right font-medium">
                          Valor
                        </th>
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
                              {ehEsta ? (
                                <span className="ml-1.5 text-legenda text-primary">
                                  esta
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 text-center tabular-nums">
                              {linha.dataVencimento ? (
                                formatarData(linha.dataVencimento)
                              ) : (
                                <CelulaVazia />
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <StatusBadge
                                status={info.badge}
                                rotulo={info.rotulo}
                              />
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
                  <p className="text-detalhe text-muted-foreground">
                    Sem rateio informado.
                  </p>
                ) : (
                  <div className="rounded-md border border-border bg-surface px-3 py-2">
                    {lancamento.rateios.map((rateio) => (
                      <Linha
                        key={rateio.id}
                        rotulo={
                          rateio.centroCustoCodigo
                            ? `${rateio.centroCustoCodigo} · ${rateio.centroCustoNome}`
                            : rateio.centroCustoNome
                        }
                      >
                        <MoneyText valor={rateio.valor} />
                      </Linha>
                    ))}
                  </div>
                )}
              </Secao>

              {carga && carga.itensOrigem.length > 0 ? (
                <Secao titulo="Itens da ordem de compra">
                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-detalhe">
                      <thead className="bg-surface">
                        <tr className="border-b border-border text-legenda text-muted-foreground">
                          <th className="px-3 py-1.5 text-center font-medium">
                            Insumo
                          </th>
                          <th className="px-3 py-1.5 text-right font-medium">
                            Qtd
                          </th>
                          <th className="px-3 py-1.5 text-right font-medium">
                            Unitário
                          </th>
                          <th className="px-3 py-1.5 text-right font-medium">
                            Subtotal
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {carga.itensOrigem.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-border last:border-0"
                          >
                            <td className="px-3 py-1.5 text-center">
                              {item.insumoNome}
                              <span className="block text-legenda text-muted-foreground">
                                {item.centroCustoNome}
                              </span>
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

              <Secao titulo="Anexos">
                <Anexos
                  entidade="lancamento"
                  entidadeId={lancamento.id}
                  anexos={carga?.anexos ?? []}
                  podeEditar={false}
                />
              </Secao>

              <Secao titulo="Trilha">
                <Trilha eventos={carga?.trilha ?? []} />
              </Secao>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border">
          {podeEditarLancamento && lancamento ? (
            <Button asChild type="button" variant="ghost" size="sm">
              <Link href={`/financeiro/lancamentos/${lancamento.id}`}>
                Abrir lançamento completo
                <ExternalLink />
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {podeRevisar && parcela ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRevisar(parcela)}
              >
                <PenLine />
                Revisar
              </Button>
            ) : null}
            {podeAprovar && parcela ? (
              <Button
                type="button"
                size="sm"
                onClick={() => onAprovar(parcela)}
              >
                <Check />
                Aprovar
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
