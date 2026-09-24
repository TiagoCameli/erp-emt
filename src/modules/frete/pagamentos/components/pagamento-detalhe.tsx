"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";

import { CelulaVazia, Trilha, type EventoTrilha } from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarData, formatarDataHora, formatarQuantidade } from "@/lib/formatadores";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { carregarTrilhaPagamento } from "@/modules/frete/pagamentos/actions";
import type { PagamentoLinha } from "@/modules/frete/pagamentos/queries";
import { rotuloMesLongo, rotuloMetodo } from "@/modules/frete/pagamentos/regras";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

export interface PagamentoDetalheProps {
  pagamento: PagamentoLinha | null;
  onFechar: () => void;
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (pagamento: PagamentoLinha) => void;
  onExcluir: (pagamento: PagamentoLinha) => void;
}

/**
 * Drawer de detalhes do pagamento (PagamentoFreteDetalhesDrawer da origem): valor, data,
 * mês referência, transportadora, método, pago por, responsável, NF, observações, anexos,
 * e a trilha da auditoria no lugar de "Lançado por / Última alteração".
 *
 * Quem usa passa `key` com o id do pagamento, para o estado recomeçar a cada um.
 */
export function PagamentoDetalhe({ pagamento, onFechar, podeEditar, podeExcluir, onEditar, onExcluir }: PagamentoDetalheProps) {
  const [trilha, setTrilha] = React.useState<EventoTrilha[] | null>(null);
  const [anexos, setAnexos] = React.useState<AnexoDoDocumento[] | null>(null);
  const id = pagamento?.id ?? null;

  React.useEffect(() => {
    if (!id) return;
    let vivo = true;
    carregarTrilhaPagamento(id)
      .then((eventos) => vivo && setTrilha(eventos))
      .catch(() => vivo && setTrilha([]));
    anexosDoDocumento("frete_pagamento", id)
      .then((lista) => vivo && setAnexos(lista))
      .catch(() => vivo && setAnexos([]));
    return () => {
      vivo = false;
    };
  }, [id]);

  const excluido = pagamento?.excluidoEm != null;

  return (
    <Sheet open={pagamento !== null} onOpenChange={(aberto) => (aberto ? undefined : onFechar())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {pagamento ? (
          <>
            <SheetHeader>
              <SheetTitle>Pagamento de frete</SheetTitle>
              <SheetDescription>
                {pagamento.transportadoraNome} · {formatarData(pagamento.data)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-6">
              <div>
                <span className="text-legenda text-muted-foreground">Valor</span>
                <p className="text-titulo font-semibold tabular-nums">
                  {formatarValorOperacional(pagamento.valor)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Dado rotulo="Data">{formatarData(pagamento.data)}</Dado>
                <Dado rotulo="Mês referência">{rotuloMesLongo(pagamento.mesReferencia)}</Dado>
                <Dado rotulo="Transportadora">{pagamento.transportadoraNome}</Dado>
                <Dado rotulo="Método">
                  {rotuloMetodo(pagamento.metodo)}
                  {pagamento.metodo === "combustivel" && pagamento.quantidadeCombustivel > 0
                    ? ` (${formatarQuantidade(pagamento.quantidadeCombustivel)} L)`
                    : ""}
                </Dado>
                <Dado rotulo="Pago por">{pagamento.pagoPor}</Dado>
                <Dado rotulo="Responsável">{pagamento.responsavel}</Dado>
                <Dado rotulo="Nota fiscal">
                  {pagamento.notaFiscal ? <span className="codigo-doc">{pagamento.notaFiscal}</span> : <CelulaVazia />}
                </Dado>
                <Dado rotulo="Lançado em">{formatarDataHora(pagamento.criadoEm)}</Dado>
                <Dado rotulo="Última alteração">{formatarDataHora(pagamento.atualizadoEm)}</Dado>
                {excluido ? (
                  <Dado rotulo="Excluído em">
                    {formatarDataHora(pagamento.excluidoEm)}
                    {pagamento.motivoExclusao ? ` · ${pagamento.motivoExclusao}` : ""}
                  </Dado>
                ) : null}
              </div>

              {pagamento.observacoes ? (
                <Dado rotulo="Observações">
                  <span className="whitespace-pre-wrap">{pagamento.observacoes}</span>
                </Dado>
              ) : null}

              <div>
                <h3 className="mb-2 text-detalhe font-medium">Anexos</h3>
                {anexos === null ? (
                  <p className="text-detalhe text-muted-foreground">Carregando anexos...</p>
                ) : (
                  <Anexos
                    entidade="frete_pagamento"
                    entidadeId={pagamento.id}
                    anexos={anexos}
                    podeEditar={podeEditar && !excluido}
                  />
                )}
              </div>

              <div>
                <h3 className="mb-2 text-detalhe font-medium">Trilha</h3>
                {trilha === null ? (
                  <p className="text-detalhe text-muted-foreground">Carregando trilha...</p>
                ) : (
                  <Trilha eventos={trilha} />
                )}
              </div>

              {!excluido && (podeEditar || podeExcluir) ? (
                <div className="flex flex-wrap gap-2">
                  {podeEditar ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onEditar(pagamento)}>
                      <Pencil />
                      Editar pagamento
                    </Button>
                  ) : null}
                  {podeExcluir ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onExcluir(pagamento)}>
                      <Trash2 />
                      Excluir pagamento
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

