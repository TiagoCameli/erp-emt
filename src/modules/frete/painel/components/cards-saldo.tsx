"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Combobox, GradeKpis, KPICard, MoneyText, SecaoDetalhe } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { salvarCardsPainel } from "@/modules/frete/painel/actions";
import type { CardSaldo } from "@/modules/frete/painel/calculo";

/** Cor do saldo no painel da origem: positivo (a EMT deve) vermelho, negativo verde. */
export function corDoSaldoAPagar(saldo: number): string {
  return saldo > 0 ? "text-status-rejeitado" : saldo < 0 ? "text-status-aprovado" : "text-muted-foreground";
}

export interface CardsSaldoProps {
  cards: CardSaldo[];
  cardsIds: string[];
  opcoes: { valor: string; rotulo: string }[];
  podeConfigurar: boolean;
  /** Link da conta corrente, quando a pessoa pode vê-la (a origem abria a aba Conta Corrente). */
  hrefContaCorrente?: string;
}

/**
 * "Saldos" + "Gerenciar cards" da origem. O saldo vem da view `transportadora_saldos`
 * (não reage ao período nem à obra, como lá). A ordem salva é a ordem de marcação.
 */
export function CardsSaldo({ cards, cardsIds, opcoes, podeConfigurar, hrefContaCorrente }: CardsSaldoProps) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [rascunho, setRascunho] = React.useState<string[]>(cardsIds);
  const [salvando, setSalvando] = React.useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await salvarCardsPainel(rascunho);
    setSalvando(false);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success("Cards salvos");
    setEditando(false);
    try {
      router.refresh();
    } catch {
      // a gravação já aconteceu
    }
  }

  return (
    <SecaoDetalhe
      titulo="Saldos"
      acao={
        podeConfigurar ? (
          <div className="flex flex-wrap items-center gap-2">
            {editando ? (
              <>
                <div className="w-72">
                  <Combobox
                    valor=""
                    onValorChange={() => {}}
                    valores={rascunho}
                    onValoresChange={setRascunho}
                    opcoes={opcoes}
                    placeholder="Selecionar fornecedores"
                    buscaPlaceholder="Buscar fornecedor"
                    size="sm"
                    ariaLabel="Fornecedores dos cards de saldo"
                  />
                </div>
                <Button type="button" size="sm" disabled={salvando} onClick={salvar}>
                  {salvando ? "Salvando..." : "Salvar cards"}
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRascunho(cardsIds);
                setEditando((aberto) => !aberto);
              }}
            >
              {editando ? "Fechar" : "Gerenciar cards"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {cards.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">
          Nenhum card escolhido.{podeConfigurar ? " Use Gerenciar cards para escolher os fornecedores." : ""}
        </p>
      ) : (
        <GradeKpis>
          {cards.map((c) => (
            <KPICard
              key={c.fornecedorId}
              titulo={c.titulo}
              href={hrefContaCorrente}
              valor={
                <span className={cn(corDoSaldoAPagar(c.saldo))}>
                  <MoneyText valor={c.saldo} />
                </span>
              }
              detalhe={
                <span className="flex flex-col">
                  {c.linhas.map((l) => (
                    <span key={l.rotulo}>
                      {l.rotulo}: {l.sinal}
                      <MoneyText valor={l.valor} />
                    </span>
                  ))}
                </span>
              }
            />
          ))}
        </GradeKpis>
      )}
    </SecaoDetalhe>
  );
}
