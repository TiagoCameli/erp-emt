"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, MoneyText } from "@/components/canonicos";
import { definirContaLancamentosLote } from "@/modules/financeiro/lancamentos/actions";
import {
  LIMITE_LOTE,
  textoResumoLote,
} from "@/modules/financeiro/lancamentos/lote";

export interface LoteContaBancariaProps {
  selecionados: string[];
  /** Valor total dos selecionados, para a confirmação mostrar o tamanho do estrago possível. */
  valorSelecionado: number;
  /** Quantos dos selecionados já têm conta: aparecem como pulados na confirmação. */
  jaComConta: number;
  contas: { valor: string; rotulo: string }[];
  onLimparSelecao: () => void;
  onConcluido: () => void;
}

/**
 * Barra que aparece quando há lançamento selecionado, e define a conta bancária
 * de todos numa ação.
 *
 * Existe porque a conta é o portão da aprovação (parcela sem conta não entra na
 * fila de pagamento) e definir uma por uma, abrindo o detalhe de cada lançamento,
 * era o atrito reportado.
 *
 * A confirmação mostra a CONTA e o VALOR TOTAL antes de gravar, de propósito: é o
 * que dá chance de perceber "não era isso que eu queria" antes, e não depois. Sem
 * esse passo, um "selecionar todos" mal filtrado só apareceria no extrato.
 */
export function LoteContaBancaria({
  selecionados,
  valorSelecionado,
  jaComConta,
  contas,
  onLimparSelecao,
  onConcluido,
}: LoteContaBancariaProps) {
  const [conta, setConta] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  const quantidade = selecionados.length;
  const acimaDoTeto = quantidade > LIMITE_LOTE;
  const recebem = Math.max(0, quantidade - jaComConta);
  const rotuloConta = contas.find((c) => c.valor === conta)?.rotulo ?? "";

  // Nada selecionado, nada de barra: ela não pode ocupar espaço à toa numa tela
  // que já é densa.
  if (quantidade === 0) return null;

  async function aoConfirmar() {
    setSalvando(true);
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
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
      <span className="text-detalhe font-medium">
        {quantidade === 1 ? "1 selecionado" : `${quantidade} selecionados`}
      </span>

      {acimaDoTeto ? (
        <span className="text-detalhe text-destructive">
          Selecione no máximo {LIMITE_LOTE} lançamentos por vez. Refine o filtro.
        </span>
      ) : (
        <>
          <div className="w-64">
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
              {". Total "}
              <MoneyText valor={valorSelecionado} />
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
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setConta("");
          onLimparSelecao();
        }}
        disabled={salvando}
      >
        Limpar seleção
      </Button>
    </div>
  );
}
