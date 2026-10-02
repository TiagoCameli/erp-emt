"use client";

import { ConfirmDialog } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { dinheiroTexto } from "@/modules/medicao/alertas/formato";
import { excluirRelatorioReajuste } from "@/modules/medicao/reajuste/actions";
import { rotuloOrigemReajuste, rotuloSituacaoReajuste } from "@/modules/medicao/reajuste/formato";
import type { RelatorioResumo } from "@/modules/medicao/reajuste/tipos";

/** O banco exige motivo com 3 letras ou mais (`fn_mc_reajuste_excluir`). */
const MIN_MOTIVO = 3;

export interface ExcluirRelatorioProps {
  /** null: diálogo fechado. */
  relatorio: RelatorioResumo | null;
  medicaoId: string;
  onFechar: () => void;
  onExcluido: () => void;
}

/**
 * Excluir um relatório de reajuste, com motivo obrigatório (mesmo molde de `ExcluirLancamento`).
 * O relatório não some: fica no histórico, riscado, com o motivo, e volta a valer o anterior não
 * excluído. A recusa do banco vira toast e o diálogo fica aberto com o motivo digitado.
 */
export function ExcluirRelatorio({ relatorio, medicaoId, onFechar, onExcluido }: ExcluirRelatorioProps) {
  async function confirmar(motivo?: string): Promise<boolean> {
    if (!relatorio) return true;
    const resultado = await excluirRelatorioReajuste(relatorio.id, medicaoId, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return false;
    }
    toast.success(`Relatório de reajuste ${relatorio.sequencia} excluído`);
    onExcluido();
    return true;
  }

  return (
    <ConfirmDialog
      aberto={relatorio !== null}
      onAbertoChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      titulo="Excluir relatório de reajuste"
      descricao={
        relatorio
          ? `Relatório ${relatorio.sequencia} (${rotuloOrigemReajuste(relatorio.origem)}, ${rotuloSituacaoReajuste(relatorio.situacao).toLowerCase()}, ${dinheiroTexto(relatorio.total)}). Ele fica no histórico, riscado, e volta a valer o anterior não excluído. Informe o motivo da exclusão.`
          : ""
      }
      textoConfirmar="Excluir relatório"
      variante="destrutivo"
      exigeMotivo
      minMotivo={MIN_MOTIVO}
      onConfirmar={confirmar}
    />
  );
}
