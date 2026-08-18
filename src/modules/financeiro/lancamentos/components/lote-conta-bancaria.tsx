"use client";

import * as React from "react";
import { toast } from "@/components/canonicos/toast";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/canonicos";
import { definirContaLancamentosLote } from "@/modules/financeiro/lancamentos/actions";
import {
  LIMITE_LOTE,
  textoResumoLote,
} from "@/modules/financeiro/lancamentos/lote";

export interface LoteContaBancariaProps {
  selecionados: string[];
  /** Quantos dos selecionados já têm conta: aparecem como pulados na confirmação. */
  jaComConta: number;
  contas: { valor: string; rotulo: string }[];
  onLimparSelecao: () => void;
  onConcluido: () => void;
  /**
   * Avisa quem monta a barra quando a gravação em lote começa e termina, pra
   * ela desabilitar "Limpar seleção" enquanto isso: limpar a seleção no meio
   * de uma gravação em voo deixa o lote sem as linhas que ele está gravando.
   */
  onSalvandoChange?: (salvando: boolean) => void;
}

/**
 * Ação de definir a conta bancária de todos os lançamentos marcados numa
 * tacada só. A barra em si (contagem, resumo, "limpar seleção") é do
 * canônico `BarraSelecao`; quem lista os lançamentos monta essa barra ao
 * redor deste componente, que só sabe do combobox de conta e da confirmação.
 *
 * Existe porque a conta é o portão da aprovação (parcela sem conta não entra na
 * fila de pagamento) e definir uma por uma, abrindo o detalhe de cada lançamento,
 * era o atrito reportado.
 *
 * O valor total dos selecionados não se repete aqui: o resumo da BarraSelecao já
 * mostra esse total o tempo todo, inclusive no instante de clicar em "Definir
 * conta bancária" — não precisa reaparecer nesta frase. O que esta frase diz, de
 * propósito, é o que vai acontecer e quantas linhas ficam de fora: é o que dá
 * chance de perceber "não era isso que eu queria" antes, e não depois.
 */
export function LoteContaBancaria({
  selecionados,
  jaComConta,
  contas,
  onLimparSelecao,
  onConcluido,
  onSalvandoChange,
}: LoteContaBancariaProps) {
  const [conta, setConta] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  const quantidade = selecionados.length;
  const acimaDoTeto = quantidade > LIMITE_LOTE;
  const recebem = Math.max(0, quantidade - jaComConta);
  const rotuloConta = contas.find((c) => c.valor === conta)?.rotulo ?? "";

  // Quem decide se isto aparece é o dono da tabela, via BarraSelecao (ela já
  // não renderiza os filhos com zero marcado). Esta guarda é só reforço para
  // quando este componente é montado isolado, como em teste.
  if (quantidade === 0) return null;

  async function aoConfirmar() {
    setSalvando(true);
    onSalvandoChange?.(true);
    try {
      const resultado = await definirContaLancamentosLote(selecionados, conta);
      if ("erro" in resultado) {
        // Seleção fica: o usuário corrige a conta e tenta de novo sem remarcar
        // tudo. Perder a seleção depois de um erro é castigo em cima de tropeço.
        toast.error(resultado.erro);
        return;
      }
      toast.success(textoResumoLote(resultado.resumo));
      setConta("");
      onLimparSelecao();
      onConcluido();
    } finally {
      setSalvando(false);
      onSalvandoChange?.(false);
    }
  }

  if (acimaDoTeto) {
    return (
      <span className="text-detalhe text-destructive">
        Selecione no máximo {LIMITE_LOTE} lançamentos por vez. Refine o filtro.
      </span>
    );
  }

  return (
    <>
      {/*
        Largura pensada para o rótulo INTEIRO caber, não para caber na tela.
        O rótulo é `${nome} - ${banco}` e o mais longo do cadastro hoje
        ("BANCO DO BRASIL 1197-5 AMAZÔNIA - Banco do Brasil") mede 371px em
        Inter 14px; somando o cromo (px-3 do gatilho + chevron, ou check +
        gaps na linha da lista, 48px nos dois casos) dá 419px, e 27rem = 432px
        cobre com folga.

        Não é capricho: o painel do Combobox herda a largura do gatilho
        (`w-(--radix-popover-trigger-width)`), então gatilho estreito trunca
        também a LISTA. Com w-64 as três contas do Banco do Brasil apareciam
        como "BANCO DO BRASIL 102.124-...", "BANCO DO BRASIL 1197-5 A..." e
        "BANCO DO BRASIL 30.893-5...", cortando exatamente o número que as
        distingue. Numa barra que define a conta de vários lançamentos de
        uma vez, escolher a conta errada por causa de reticências é o defeito
        que essa medida existe para impedir.
      */}
      <div className="w-[27rem]">
        <Combobox
          valor={conta}
          onValorChange={setConta}
          opcoes={contas}
          placeholder="Escolha a conta bancária"
          buscaPlaceholder="Buscar conta"
        />
      </div>

      {conta !== "" && (
        <span className="text-detalhe text-muted-foreground">
          {recebem === 1
            ? "1 lançamento recebe"
            : `${recebem} lançamentos recebem`}{" "}
          {rotuloConta}
          {jaComConta > 0 && (
            <>
              {", e "}
              {jaComConta === 1
                ? "1 já tem conta e será pulado"
                : `${jaComConta} já têm conta e serão pulados`}
            </>
          )}
          {"."}
        </span>
      )}

      <Button
        size="sm"
        onClick={aoConfirmar}
        disabled={conta === "" || recebem === 0 || salvando}
      >
        {salvando ? "Definindo..." : "Definir conta bancária"}
      </Button>
    </>
  );
}
