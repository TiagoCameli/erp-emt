"use client";

import * as React from "react";
import Link from "next/link";
import { Droplet, ExternalLink, Gauge, LoaderCircle, Pencil, Trash2, Wallet } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { formatarDataHoraCurta, KpiDetalhe } from "@/modules/combustivel/_shared/components/lista-operacional";
import { carregarAbastecimento } from "@/modules/combustivel/abastecimentos/detalhe-actions";
import { rotaDoAbastecimento } from "@/modules/combustivel/abastecimentos/filtros";
import type { AbastecimentoCompleto, SaidaLista } from "@/modules/combustivel/abastecimentos/queries";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";
import { AbastecimentoDetalheConteudo } from "./abastecimento-detalhe";
import { ROTULO_ORIGEM_CURTO } from "./rotulos-lista";

type Carga = { id: string; resultado: AbastecimentoCompleto | { erro: string } };

export interface AbastecimentoDetalheDrawerProps {
  /** A linha clicada; nulo fecha. */
  saida: SaidaLista | null;
  onFechar: () => void;
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (abastecimento: AbastecimentoCompleto) => void;
  onExcluir: (saida: SaidaLista) => void;
}

/**
 * O SaidaDetalhesDrawer da origem: leitura rápida sem sair da lista. Os números do topo
 * (Litros, Valor, R$/L, Origem) saem da própria linha, na hora; o corpo é o mesmo da página
 * do abastecimento (dados, camadas do PEPS, conta corrente, alocações), lido do servidor.
 * O rodapé tem Editar e Excluir, como na origem, e o link da página inteira.
 *
 * A resposta fica guardada pelo id que a pediu: resposta de uma linha velha (clique rápido
 * em outra) é descartada, e o estado só muda no retorno da action, nunca no efeito.
 */
export function AbastecimentoDetalheDrawer({
  saida,
  onFechar,
  podeEditar,
  podeExcluir,
  onEditar,
  onExcluir,
}: AbastecimentoDetalheDrawerProps) {
  const id = saida?.id ?? null;
  const [carga, setCarga] = React.useState<Carga | null>(null);

  React.useEffect(() => {
    if (!id) return;
    let vivo = true;
    carregarAbastecimento(id)
      .then((resposta) => {
        if (!vivo) return;
        setCarga({ id, resultado: "erro" in resposta ? { erro: resposta.erro } : resposta.abastecimento });
      })
      .catch(() => {
        if (vivo) setCarga({ id, resultado: { erro: "Não foi possível carregar o abastecimento" } });
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  const resultado = carga && carga.id === id ? carga.resultado : null;
  const completo = resultado && !("erro" in resultado) ? resultado : null;

  return (
    <Sheet
      open={saida !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Saída de combustível</SheetTitle>
          <SheetDescription>
            {saida ? `${formatarDataHoraCurta(saida.data)} · ${saida.consumidor || "Consumidor não informado"}` : ""}
          </SheetDescription>
        </SheetHeader>

        {saida ? (
          <div className="flex flex-col gap-5 p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiDetalhe icone={Droplet} rotulo="Litros">
                {formatarLitros(saida.litros)}
              </KpiDetalhe>
              <KpiDetalhe icone={Wallet} rotulo="Valor">
                <MoneyText valor={saida.valorTotal} />
              </KpiDetalhe>
              <KpiDetalhe icone={Gauge} rotulo="R$/L">
                {saida.precoUnitario > 0 ? formatarValorOperacional(saida.precoUnitario) : "—"}
              </KpiDetalhe>
              <KpiDetalhe rotulo="Origem">
                <span className="text-detalhe">{ROTULO_ORIGEM_CURTO[saida.origem]}</span>
              </KpiDetalhe>
            </div>

            {completo ? (
              <AbastecimentoDetalheConteudo abastecimento={completo} />
            ) : resultado && "erro" in resultado ? (
              <p role="alert" className="text-detalhe text-destructive">
                {resultado.erro}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-detalhe text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Carregando o detalhe
              </p>
            )}
          </div>
        ) : null}

        {saida ? (
          <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t border-border">
            <Button asChild variant="ghost" size="sm" className="mr-auto">
              <Link href={rotaDoAbastecimento(saida.id)}>
                <ExternalLink />
                Abrir página
              </Link>
            </Button>
            {podeEditar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!completo}
                onClick={() => {
                  if (completo) onEditar(completo);
                }}
              >
                <Pencil />
                Editar
              </Button>
            ) : null}
            {podeExcluir ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => onExcluir(saida)}>
                <Trash2 />
                Excluir
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
